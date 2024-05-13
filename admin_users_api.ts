import { privateInstance } from 'common/services';
import {
  TUsersResponse,
  TParamsRequestUsersType,
  TOneUserType,
  TEdituserRequest,
  TCreateUserRequest,
  TGetAllUsersRequest,
} from './types';

export const getUsersApi = async (data: TParamsRequestUsersType) => {
  const response = await privateInstance.get<TUsersResponse>('/user/api/v1/admin/user', {
    params: data,
  });
  return response.data;
};

export const getCurrentUserApi = async (id: string) => {
  const response = await privateInstance.get<TOneUserType>(`/user/api/v1/admin/user/${id}`);
  return response.data;
};

export const deleteUserApi = async (id: string) => {
  await privateInstance.delete(`/user/api/v1/admin/user/${id}`);
};

export const editUserApi = async ({ id, data }: TEdituserRequest) => {
  await privateInstance.patch(`/user/api/v1/admin/user/${id}`, data);
};

export const createUser = async (newUserdata: TCreateUserRequest) => {
  await privateInstance.post('/user/api/v1/admin/user', newUserdata);
};

export class User {
  //get all users
  static async getAllUsers({
    params,
  }: TGetAllUsersRequest['payload']): Promise<TGetAllUsersRequest['response']> {
    const response = await privateInstance.get('user/api/v1/admin/user/counts', { params });

    return response.data;
  }
}
