import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import { Connectivity as UserConn } from "@/anchor/user";
import * as anchor from "@coral-xyz/anchor";
import { web3Consts } from "@/anchor/web3Consts";
import axios from "axios";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { Connection, Keypair } from "@solana/web3.js";
export async function GET(req: NextRequest) {
  const offerCollection = db.collection("mmosh-app-project-offer");
  const inviteCollection = db.collection("mmosh-app-project-invites");
  const receiptCollection = db.collection("mmosh-app-offer-receipt");
  const subscriptionCollection = db.collection("mmosh-app-offer-subscription");
  const { searchParams } = new URL(req.url);
  const offer = searchParams.get("offer");
  const signature = searchParams.get("signature");
  const receiver = searchParams.get("receiver");
  const type = searchParams.get("pricetype");
  const price = searchParams.get("price");
  const supply = searchParams.get("supply");
  const paidtype = searchParams.get("paidType");


  if (!offer) {
    console.log("offer param not found");
    return NextResponse.json(false, {
      status: 200,
    });
  }

  let rpcUrl: any = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  let connection = new Connection(rpcUrl, {
    confirmTransactionInitialTimeout: 120000,
  });
  let wallet = new NodeWallet(new Keypair());
  const env = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "processed",
  });
  let userConn: UserConn = new UserConn(env, web3Consts.programID);

  console.log(
    "offer --------------------------------------------------- ",
    offer
  );

  // let offerInfo = await userConn.metaplex.nfts().findByMint({
  //   mintAddress: new anchor.web3.PublicKey(offer)
  // })

  let gensisOffer: any = offer;
  let startDate: any = "";
  let endDate: any = "";
  if (paidtype === "month") {
    endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    startDate = new Date();
  } else if (paidtype === "year") {
    endDate = new Date();
    endDate.setDate(endDate.getDate() + 365);
    startDate = new Date();
  }
  console.log(endDate, "endDate ==================>>");

  let offerData: any = await offerCollection.findOne({ key: gensisOffer });
  if (!offerData) {
    console.log("offer not available");
    return NextResponse.json(false, {
      status: 200,
    });
  }

  console.log(offerData, "offerData from the database ==============>>");

  const receipt = await receiptCollection.findOne({ key: offer });
  console.log(receipt, "receipt from the database ==============>>");
  if (receipt) {
    if (type == "subscription") {
      const result = await receiptCollection.updateOne(
        { key: offer },
        {
          $set: {
            created_date: new Date(),
            updated_date: new Date(),
          },
        }
      );
    } else {
      return NextResponse.json(false, {
        status: 200,
      });
    }
  }
  if (startDate != "" && endDate != "") {
    const data = await subscriptionCollection.findOne({
      offer: gensisOffer,
      wallet: receiver,
    });

    console.log(data, "subscription data ==================>>");
    if (!data) {
      await subscriptionCollection.insertOne({
        offer: gensisOffer,
        start: startDate,
        end: endDate,
        wallet: receiver,
        status: "active", // active, cancel, expired
        type,
        created_date: new Date(),
        updated_date: new Date(),
      });
    } else {
      await subscriptionCollection.updateOne(
        {
          _id: data._id,
        },
        {
          $set: {
            start: startDate,
            end: endDate,
            type,
            status: "active",
          },
        }
      );
    }
  }
  //type
  //supply
  // price

  await receiptCollection.insertOne({
    offer: gensisOffer,
    key: offer,
    price,
    supply,
    buyer: receiver,
    signature,
    type,
    created_date: new Date(),
    updated_date: new Date(),
  });

  if (offerData.badge) {
    let inviteData = await inviteCollection.findOne({
      offerkey: offerData.key,
      wallet: receiver,
    });
    if (inviteData) {
      if (inviteData.value > 1) {
        await inviteCollection.updateOne(
          {
            _id: inviteData._id,
          },
          {
            $set: {
              value: inviteData.value - 1,
            },
          }
        );
      } else {
        await inviteCollection.deleteOne({
          offerkey: offerData.key,
          wallet: receiver,
        });
      }
    }
  }

  await offerCollection.updateOne(
    {
      _id: offerData._id,
    },
    {
      $set: {
        seniority: offerData.seniority ? offerData.seniority + 1 : 1,
        sold: offerData.sold + supply,
      },
    }
  );

  return NextResponse.json(true, {
    status: 200,
  });
}
