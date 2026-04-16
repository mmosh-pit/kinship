import { User } from "../models/user";
import { db } from "./mongoClient";

export async function getUserDataForMetadata(username: string) {
  const collection = db.collection("users");

  const user = await collection.findOne<User>(
    {
      "profile.username": username,
    },
    {
      collation: {
        locale: "en",
        strength: 2,
      },
      projection: {
        profile: 1,
        _id: 0,
      },
    },
  );

  return user;
}
