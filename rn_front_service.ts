import { axiosPrivate, axiosPrivateImage } from '@app/common/api'
import * as Types from './types'

class User {
  // Get Electoral Roll
  public async getElectoralRoll({
    epicNumber,
    name,
  }: Types.TGetElectoralRollPayload['request']): Promise<
    Types.TGetElectoralRollPayload['response']
  > {
    return axiosPrivate.get(
      `/electoral-roll?epicNumber=${epicNumber}&name=${name}`,
    )
  }

  // Get State Display
  public async getStateDisplay({
    ...params
  }: Types.TGetStateDisplayPayload['request']): Promise<
    Types.TGetStateDisplayPayload['response']
  > {
    return axiosPrivate.get(`/electoral-roll/state-display`, { params })
  }

  // Get Check Credentials
  public async getCheckCredentials({
    ...params
  }: Types.TGetCheckCredentialsPayload['request']): Promise<
    Types.TGetCheckCredentialsPayload['response']
  > {
    return axiosPrivate.get(`/user/check-credentials`, { params })
  }

  // Get User Me
  public async getUserMe(): Promise<Types.TGetUserMePayload['response']> {
    return axiosPrivate.get(`/user/me`)
  }

  // Get Data by AP
  public async getIPData({
    ...params
  }: Types.TGetIPDataPayload['request']): Promise<
    Types.TGetIPDataPayload['response']
  > {
    return axiosPrivate.get(`/user/ip-data`, { params })
  }

  public async postUserPhoto(
    data: Types.TPostUserPhotoPayload['request'],
  ): Promise<Types.TPostUserPhotoPayload['response']> {
    return axiosPrivateImage.post(`/file/api/upload`, data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  }

  public async postUser(
    data: Types.TPostUserPayload['request'],
  ): Promise<Types.TPostUserPayload['response']> {
    return axiosPrivate.post(`/user/me`, data)
  }

  public async updateUser(
    data: Types.TPatchUserPayload['request'],
  ): Promise<Types.TPatchUserPayload['response']> {
    return axiosPrivate.patch(`/user/me`, data)
  }
}

export default new User()
