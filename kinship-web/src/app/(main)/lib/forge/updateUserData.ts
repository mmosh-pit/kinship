import client from "../httpClient";

export const updateUserData = async (params: any) => {
  await client.put("/update-profile-data", params);
};
