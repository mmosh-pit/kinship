import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/(main)/lib/mongoClient";
import { deleteShdwDriveFile } from "@/app/(main)/lib/deleteShdwDriveFile";

export async function PATCH(req: NextRequest) {
  const communitiesCollection = db.collection("mmosh-app-community");

  const { profileAddress, data, completed } = await req.json();

  const existingCommunity = await communitiesCollection.findOne({
    profileAddress,
    completed: {
      $exists: false,
    },
  });

  if (!existingCommunity) {
    await communitiesCollection.insertOne({
      profileAddress,
      data,
    });

    return NextResponse.json("", { status: 201 });
  }

  if (data?.coinImage !== existingCommunity!.coinImage) {
    await deleteShdwDriveFile(existingCommunity!.coinImage);
  }

  if (data?.passImage !== existingCommunity!.passImage) {
    await deleteShdwDriveFile(existingCommunity!.passImage);
  }

  if (data?.inviteImage !== existingCommunity!.inviteImage) {
    await deleteShdwDriveFile(existingCommunity!.inviteImage);
  }

  const updateDataOperation: any = {};

  Object.keys(data).forEach((val) => {
    updateDataOperation[`data.${val}`] = data[val];
  });

  if (completed) {
    await communitiesCollection.updateOne(
      { _id: existingCommunity!._id },
      { $set: { ...updateDataOperation, completed } },
    );

    return NextResponse.json("", { status: 201 });
  }

  await communitiesCollection.updateOne(
    { _id: existingCommunity!._id },
    { $set: { ...updateDataOperation } },
  );

  return NextResponse.json("", { status: 201 });
}
