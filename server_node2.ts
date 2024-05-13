import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { HttpService } from 'nestjs-http-promise';
import { AssemblyConstituencyService } from 'src/assembly-constituency/assembly-constituency.service';
import { DistrictService } from 'src/district/district.service';
import { FirebaseService } from 'src/firebase/firebase.service';
import { ParliamentaryConstituencyService } from 'src/parliamentary-constituency/parliamentary-constituency.service';
import { User, UserDocument } from 'src/schema/user';
import { UserSession, UserSessionDocument } from 'src/schema/user-session';
import { StateService } from 'src/state/state.service';
import { IFacetResult } from 'src/types/IFacetResult';
import { pagination } from 'src/types/pagination';
import { facetTotalCount } from 'src/utils/facetTotalCount';

import { CheckCredentialsDto } from './dto/check-credentials.dto';
import { GeoByIpDto } from './dto/geo-by-ip.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(UserSession.name)
    private readonly userSessionModel: Model<UserSessionDocument>,
    private readonly assemblyConstituencyService: AssemblyConstituencyService,
    private readonly parliamentaryConstituencyService: ParliamentaryConstituencyService,
    private readonly stateService: StateService,
    private readonly districtService: DistrictService,
    private readonly httpService: HttpService,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Retrieves online counts based on the provided filter and timespan.
   *
   * @param {FilterQuery<UserSessionDocument>} filter - The filter to apply to the user sessions.
   * @param {string} timespan - The timespan to use for grouping the results. Defaults to '%Y-%m' if not provided.
   * @return {Promise<{byPlatform: Array<{_id: string, online: number}>, byDate: Array<{_id: string, count: number}>}>} - An object containing the online counts grouped by platform and by date.
   */
  async getOnlineCounts(
    filter: FilterQuery<UserSessionDocument>,
    timespan: string,
  ) {
    const today = new Date();
    today.setHours(0);
    today.setMinutes(0);

    const userFilter: FilterQuery<UserDocument> = {
      activeSockets: { $ne: [] },
    };
    if (filter.state) userFilter['location.state'] = filter.state;

    const [byPlatform, byDate] = await Promise.all([
      this.userModel.aggregate([
        {
          $match: userFilter,
        },
        {
          $unwind: {
            path: '$activeSockets',
          },
        },
        {
          $group: {
            _id: '$activeSockets.platform',
            online: {
              $sum: 1,
            },
          },
        },
      ]),
      this.userSessionModel.aggregate([
        {
          $match: filter,
        },
        {
          $addFields: {
            metadate: {
              $dateToString: {
                date: '$date',
                format: timespan ?? '%Y-%m',
              },
            },
          },
        },

        {
          $group: {
            _id: '$metadate',
            count: {
              $sum: 1,
            },
          },
        },
      ]),
    ]);

    return { byPlatform, byDate };
  }

  /**
   * Retrieves the counts of users that match the given filter within a specified timespan.
   *
   * @param {FilterQuery<UserDocument>} filter - The filter to apply to the user documents.
   * @param {string} timespan - The timespan to group the counts by. Defaults to '%Y-%m-%d'.
   * @return {Promise<any[]>} An array of objects containing the metadate and count.
   */
  async getCounts(
    filter: FilterQuery<UserDocument>,
    timespan: string,
  ): Promise<any[]> {
    return this.userModel.aggregate([
      {
        $match: filter,
      },
      {
        $addFields: {
          metadate: {
            $dateToString: {
              format: timespan ?? '%Y-%m-%d',
              date: '$createdAt',
            },
          },
        },
      },
      {
        $group: {
          _id: '$metadate',
          count: {
            $sum: 1,
          },
        },
      },
    ]);
  }

  /**
   * Retrieves the geographic information based on the given IP address.
   *
   * @param {string} ip - The IP address to retrieve the geographic information for.
   * @param {string} [userId] - The optional user ID to update with the retrieved information.
   * @returns {Promise<GeoByIpDto>} A promise that resolves to an object containing the geographic information.
   */
  async getGeoByIp(ip: string, userId?: string): Promise<GeoByIpDto> {
    const { data: geo } = await this.httpService.get(
      `http://ipinfo.io/${ip}?token=539fe2e8e703ac`,
    );
    console.log('GEO', geo);

    const location: GeoByIpDto = {};

    if (userId) {
      await this.userModel.updateOne(
        { firebaseId: userId },
        { ipGeo: `India, ${geo.region}, ${geo.city}`, lastIp: ip },
      );
    }

    if (geo.country != 'IN') return location;

    location.assemblyConstituency =
      await this.assemblyConstituencyService.findOne({
        name: { $regex: geo.city, $options: 'i' },
      });

    if (!location.assemblyConstituency) return {};

    location.parliamentaryConstituency =
      await this.parliamentaryConstituencyService.findOne({
        _id: location.assemblyConstituency.parliamentaryConstituency,
      });

    location.district = await this.districtService.findOne({
      _id: location.assemblyConstituency.district,
    });

    location.state = await this.stateService.findOne({
      _id: location.district.state,
    });

    return location;
  }

  /**
   * Finds documents in the collection that match the given filter.
   *
   * @param {FilterQuery<UserDocument>} filter - The filter to apply when querying the collection.
   * @return {Promise<UserDocument[]>} - A promise that resolves to an array of documents that match the filter.
   */
  async findByFilter(filter: FilterQuery<UserDocument>) {
    return this.userModel.aggregate([
      { $match: filter },
      {
        $addFields: {
          'location.state': {
            $toString: '$location.state',
          },
          'location.district': {
            $toString: '$location.district',
          },
          'location.assemblyConstituency': {
            $toString: '$location.assemblyConstituency',
          },
          'location.parliamentaryConstituency': {
            $toString: '$location.parliamentaryConstituency',
          },
        },
      },
    ]);
  }

  /**
   * Asynchronously creates a new user document in the database with the given
   * data. First checks if a user with the same firebaseId already exists, and
   * throws a BadRequestException if so. Then checks if a user with the same
   * credentials already exists, and throws a BadRequestException if so. Finally,
   * creates a new user document with the given data and returns it.
   *
   * @param {Partial<UserDocument>} data - The data for the user document to create.
   * @return {Promise<UserDocument>} The newly created user document.
   */
  async create(data: Partial<UserDocument>): Promise<UserDocument> {
    if (await this.userModel.exists({ firebaseId: data.firebaseId })) {
      throw new BadRequestException('User already exists');
    }

    const check = await this.checkCredentials(data);

    if (check) {
      throw new BadRequestException(
        'User with given credentials already exists',
      );
    }

    data.activeSockets = [];

    const user = await this.userModel.create(data);

    this.firebaseService.auth().setCustomUserClaims(data.firebaseId, {
      location: user?.location,
      dateOfBirth: user?.dateOfBirth,
      gender: user?.gender,
    });

    try {
      const user = await this.firebaseService.auth().getUser(data.firebaseId);

      if (data.email && user.emailVerified) {
        data.emailVerified = true;
      }

      if (data.phone && user.phoneNumber == data.phone) {
        data.phoneVerified = true;
      }
    } catch (error) {
      console.log(error);
    }

    return user;
  }

  /**
   * Checks if the given credentials match an existing user.
   *
   * @async
   * @param {Object} credentials - An object containing optional phone,
   * email, firebaseId, and _id properties.
   * @param {string} [credentials.phone] - The user's phone number.
   * @param {string} [credentials.email] - The user's email address.
   * @param {string} [credentials.firebaseId] - The user's Firebase ID.
   * @param {voterId} [credentials.voterId] - The user's Epic Number.
   * @param {Types.ObjectId} [credentials._id] - The user's MongoDB ObjectID.
   * @return {Promise<boolean>} A promise that resolves to a boolean indicating
   * whether or not the credentials match an existing user.
   */
  async checkCredentials(credentials: CheckCredentialsDto): Promise<boolean> {
    const query: FilterQuery<UserDocument> = {
      $and: [],
    };

    const or: FilterQuery<UserDocument> = {
      $or: [
        {
          $and: [
            { phone: credentials.phone },
            { phone: { $ne: '' } },
            { phone: { $ne: null } },
          ],
        },
        {
          $and: [
            { email: credentials.email },
            { email: { $ne: '' } },
            { email: { $ne: null } },
          ],
        },
      ],
    };

    if (credentials.voterId) {
      or.$or.push({
        $and: [
          { voterId: credentials.voterId },
          { voterId: { $ne: '' } },
          { voterId: { $ne: null } },
        ],
      });
    }

    if (credentials.firebaseId) {
      query!.$and!.push({
        firebaseId: { $ne: credentials.firebaseId },
      });
    }
    if (credentials._id) {
      query!.$and!.push({
        _id: { $ne: credentials._id },
      });
    }

    query.$and.push(or);

    return this.userModel.exists(query) as unknown as Promise<boolean>;
  }

  /**
   * Asynchronously updates a user document in the database that matches the provided query with the provided data.
   *
   * @param {FilterQuery<UserDocument>} query - The query to match documents to update.
   * @param {Partial<UserDocument>} data - The data to update the matched documents with.
   * @return {Promise<UserDocument>} The updated user document or throws a ForbiddenException if no document was found matching the query.
   */
  async update(
    query: FilterQuery<UserDocument>,
    data: UpdateQuery<UserDocument>,
  ): Promise<UserDocument> {
    try {
      const user = await this.firebaseService.auth().getUser(query.firebaseId);

      if (data.email && user.emailVerified) {
        data.emailVerified = true;
      }

      if (data.phone && user.phoneNumber == data.phone) {
        data.phoneVerified = true;
      }
    } catch (error) {
      console.log(error);
    }

    return this.userModel
      .findOneAndUpdate(query, data)
      .orFail(new ForbiddenException('User not exists'));
  }

  /**
   * Asynchronously finds a single document that matches the given query
   * in the User collection.
   *
   * @param {FilterQuery<UserDocument>} query - The query used to find the user.
   * @return {Promise<UserDocument>} - A promise that resolves to the found user,
   * or null if no user was found.
   */
  async findOne(query: FilterQuery<UserDocument>): Promise<UserDocument> {
    return (
      await this.userModel.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'State',
            localField: 'location.state',
            foreignField: '_id',
            as: 'location.state',
          },
        },
        {
          $lookup: {
            from: 'District',
            localField: 'location.district',
            foreignField: '_id',
            as: 'location.district',
          },
        },
        {
          $lookup: {
            from: 'AssemblyConstituency',
            localField: 'location.assemblyConstituency',
            foreignField: '_id',
            as: 'location.assemblyConstituency',
          },
        },
        {
          $lookup: {
            from: 'ParliamentaryConstituency',
            localField: 'location.parliamentaryConstituency',
            foreignField: '_id',
            as: 'location.parliamentaryConstituency',
          },
        },
        {
          $addFields: {
            'location.district': {
              $first: '$location.district',
            },
            'location.state': {
              $first: '$location.state',
            },
            'location.parliamentaryConstituency': {
              $first: '$location.parliamentaryConstituency',
            },
            'location.assemblyConstituency': {
              $first: '$location.assemblyConstituency',
            },
          },
        },
      ])
    )[0];
  }

  /**
   * Asynchronously finds a user based on the given filter query and pagination metadata.
   *
   * @param {FilterQuery<UserDocument>} query - The filter query used to search for the user.
   * @param {pagination} meta - The pagination metadata used to limit the search results.
   * @return {Promise<IFacetResult<UserDocument>>} A promise that resolves to the found user document.
   */
  async find(
    query: FilterQuery<UserDocument>,
    meta: pagination,
  ): Promise<IFacetResult<UserDocument>> {
    return (
      await this.userModel.aggregate([
        { $match: query },
        ...facetTotalCount(meta, [
          {
            $lookup: {
              from: 'State',
              localField: 'location.state',
              foreignField: '_id',
              as: 'location.state',
            },
          },
          {
            $lookup: {
              from: 'District',
              localField: 'location.district',
              foreignField: '_id',
              as: 'location.district',
            },
          },
          {
            $lookup: {
              from: 'AssemblyConstituency',
              localField: 'location.assemblyConstituency',
              foreignField: '_id',
              as: 'location.assemblyConstituency',
            },
          },
          {
            $lookup: {
              from: 'ParliamentaryConstituency',
              localField: 'location.parliamentaryConstituency',
              foreignField: '_id',
              as: 'location.parliamentaryConstituency',
            },
          },
          {
            $addFields: {
              'location.district': {
                $first: '$location.district',
              },
              'location.state': {
                $first: '$location.state',
              },
              'location.parliamentaryConstituency': {
                $first: '$location.parliamentaryConstituency',
              },
              'location.assemblyConstituency': {
                $first: '$location.assemblyConstituency',
              },
            },
          },
        ]),
      ])
    )[0];
  }

  /**
   * Asynchronously deletes a user document that matches the given query.
   *
   * @param {FilterQuery<UserDocument>} query - The query used to filter the user documents to delete.
   * @return {Promise<any>} A promise that resolves to the result of the delete operation.
   */
  async delete(query: FilterQuery<UserDocument>): Promise<any> {
    return this.userModel.deleteOne(query);
  }

  async connected(data: {
    user: string;
    socketid: string;
    platform: 'app' | 'web' | 'webmobile';
  }) {
    if (!data.socketid || !data.user) return;

    const now = new Date();

    console.log(
      await this.userModel.updateOne(
        { firebaseId: data.user },
        {
          $push: {
            activeSockets: {
              $each: [
                { socketid: data.socketid, platform: data.platform, date: now },
              ],
            },
          },
          $inc: {
            ['platformOnline.' + data.platform]: 1,
          },
        },
      ),
    );

    const user = await this.userModel.findOne({ firebaseId: data.user });

    this.userSessionModel.create({
      ...data,
      date: now,
      state: user?.location?.state,
    });
  }

  async disconnected(data: { socketid: string }) {
    await this.userModel.updateOne(
      { 'activeSockets.socketid': data.socketid },
      { $pull: { activeSockets: { socketid: data.socketid } } },
    );
  }
}

