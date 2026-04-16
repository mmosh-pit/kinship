import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import { Connectivity as UserConn } from "@/anchor/user";
import * as anchor from "@coral-xyz/anchor";
import { web3Consts } from "@/anchor/web3Consts";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Connection, Keypair } from "@solana/web3.js";
import axios from "axios";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-donation-profile");
  const historyCollection = db.collection("mmosh-app-donation-history");
  const { wallet, firstname, lastname, middlename, addressone, addresstwo, city, state, zip, image, amount, usdvalue, token } = await req.json();
  const donationProfile = await collection.findOne({
    wallet: wallet,
  });


  if (!donationProfile) {
    await collection.insertOne({
      wallet: wallet,
      firstname,
      middlename,
      lastname,
      addressone,
      addresstwo,
      city,
      state,
      zip,
      image,
      created_date: new Date(),
      updated_date: new Date(),
    });
  } else {
      await collection.updateOne(
        {
          _id: donationProfile._id,
        },
        {
          $set: {
            firstname,
            middlename,
            lastname,
            addressone,
            addresstwo,
            city,
            state,
            zip,
            image
          },
        },
      );
  }

  await historyCollection.insertOne({
    wallet: wallet,
    amount,
    usdvalue,
    token,
    created_date: new Date(),
    updated_date: new Date(),
  });
  return NextResponse.json("", { status: 200 });
}
