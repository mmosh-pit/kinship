import axios from "axios";
import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";
import { Guild, GuildFilter } from "@/app/(main)/models/guild";

const gensMap = {
  gen1: "lineage.promotor",
  gen2: "lineage.scout",
  gen3: "lineage.recruitor",
  gen4: "lineage.originator",
};

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-stake");

  const data = await req.json();

  const stakeData = await collection.findOne({
    coin: data.coin,
  });

  console.log("data.distribution", data.distribution)
  if (data.distribution.mutal > 0) {
    const mutals = await db.collection("mmosh-app-connections").find(
      {
       sender: data.creator,
       status: 2
      }
    ).toArray();
    console.log("mutals ", mutals);
    if(mutals.length > 0) {
      let reward = (data.amount * (data.distribution.mutal/100)) / mutals.length
      console.log("mutals reward ", reward);
      for (let index = 0; index < mutals.length; index++) {
        const element = mutals[index];
        saveStake({
          wallet: element.receiver,
          coin: data.coin,
          reward,
        })

        const receiverDetail:any = await db.collection("users").findOne({
          wallet: element.receiver,
        });
  
        await sendNotification({
          type: "reward",
          message: (receiverDetail ? receiverDetail.profile.username :  element.receiver) + " sent you reward",
          unread: 1,
          sender: data.creator,
          receiver: element.receiver,
          created_date:new Date()
        })
      }
    }
  }

  if (data.distribution.outbound > 0) {
    const outbound = await db.collection("mmosh-app-connections").find(
      {
      sender: data.creator,
      status: 1
      }
    ).toArray();
    console.log("outbound ", outbound);
    if(outbound.length > 0) {
      let reward = (data.amount * (data.distribution.outbound/100)) / outbound.length
      console.log("outbound reward ", reward);
      for (let index = 0; index < outbound.length; index++) {
        const element = outbound[index];
        saveStake({
          wallet: element.receiver,
          coin: data.coin,
          reward,
        })
        const receiverDetail:any = await db.collection("users").findOne({
          wallet: element.receiver,
        });
  
        await sendNotification({
          type: "reward",
          message: (receiverDetail ? receiverDetail.profile.username :  element.receiver) + " sent you reward",
          unread: 1,
          sender: data.creator,
          receiver: element.receiver,
          created_date:new Date()
        })
      }
    }
  }

  if (data.distribution.inbound > 0) {
    const inbound = await db.collection("mmosh-app-connections").find(
      {
       receiver: data.creator,
       status: 1
      }
    ).toArray();
    console.log("inbound ", inbound);
    if(inbound.length > 0) {
      let reward = (data.amount * (data.distribution.inbound/100)) / inbound.length
      console.log("inbound reward ", reward);
      for (let index = 0; index < inbound.length; index++) {
        const element = inbound[index];
        saveStake({
          wallet: element.sender,
          coin: data.coin,
          reward,
        })
        const receiverDetail:any = await db.collection("users").findOne({
          wallet: element.sender,
        });
  
        await sendNotification({
          type: "reward",
          message: (receiverDetail ? receiverDetail.profile.username :  element.sender) + " sent you reward",
          unread: 1,
          sender: data.creator,
          receiver: element.sender,
          created_date:new Date()
        })
      }
    }
  }

  const gensDecoded: GuildFilter[] = ["gen1","gen2", "gen3", "gen4"];
  const filter = {
    $or: [] as Guild[],
  };

  gensDecoded.forEach((gen) => {
    filter.$or.push({ [gensMap[gen]]: data.creator });
  });

  const guilds = await db.collection("mmosh-app-lineage")
    .find<{ lineage: Guild; profile: string }>(filter, {
      projection: {
        _id: 0,
        lineage: 1,
        profile: 1,
      },
    })
    .toArray();

  console.log("guilds ", guilds);

  let scout=[]
  let promoter=[]
  let creator=[]
  let curator=[]
  for (const value of guilds) {
    if (value.lineage.promotor === data.creator) {
      promoter.push(value.profile)
    }
    if (value.lineage.scout === data.creator) {
      scout.push(value.profile)
    }
    if (value.lineage.originator === data.creator) {
      creator.push(value.profile)
    }
    if (value.lineage.recruitor === data.creator) {
      curator.push(value.profile)
    }
  }
  console.log("scout ", scout);
  if (data.distribution.scout > 0 && scout.length > 0) {
    let reward = (data.amount * (data.distribution.scout/100)) / scout.length
    console.log("scout reward ", reward);
    for (let index = 0; index < scout.length; index++) {
      const element = scout[index];
      saveStake({
        wallet: element,
        coin: data.coin,
        reward,
      })
      const receiverDetail:any = await db.collection("users").findOne({
        wallet: element,
      });

      await sendNotification({
        type: "reward",
        message: (receiverDetail ? receiverDetail.profile.username :  element) + " sent you reward",
        unread: 1,
        sender: data.creator,
        receiver: element,
        created_date:new Date()
      })
    }
  }
  console.log("promoter ", promoter);
  if (data.distribution.promoter > 0 && promoter.length > 0) {
    let reward = (data.amount * (data.distribution.promoter/100)) / promoter.length
    console.log("promoter reward ", reward);
    for (let index = 0; index < promoter.length; index++) {
      const element = promoter[index];
      saveStake({
        wallet: element,
        coin: data.coin,
        reward,
      })
      const receiverDetail:any = await db.collection("users").findOne({
        wallet: element,
      });

      await sendNotification({
        type: "reward",
        message: (receiverDetail ? receiverDetail.profile.username :  element) + " sent you reward",
        unread: 1,
        sender: data.creator,
        receiver: element,
        created_date:new Date()
      })
    }
  }

  console.log("creator ", creator);
  if (data.distribution.creator > 0 && creator.length > 0) {
    let reward = (data.amount * (data.distribution.creator/100)) / creator.length
    console.log("creator reward ", reward);
    for (let index = 0; index < creator.length; index++) {
      const element = creator[index];
      saveStake({
        wallet: element,
        coin: data.coin,
        reward,
      })
      const receiverDetail:any = await db.collection("users").findOne({
        wallet: element,
      });

      await sendNotification({
        type: "reward",
        message: (receiverDetail ? receiverDetail.profile.username :  element) + " sent you reward",
        unread: 1,
        sender: data.creator,
        receiver: element,
        created_date:new Date()
      })
    }
  }

  console.log("curator ", curator);
  if (data.distribution.curator > 0 && curator.length > 0) {
    let reward = (data.amount * (data.distribution.curator/100)) / curator.length
    console.log("curator reward ", reward);
    for (let index = 0; index < curator.length; index++) {
      const element = curator[index];
      saveStake({
        wallet: element,
        coin: data.coin,
        reward,
      })
    }
  }


  if(stakeData) {
    await collection.updateOne(
        {
          _id: stakeData._id,
        },
        {
          $set: {
            distribution: data.distribution,
            unlockDate: data.unlockDate,
            amount: stakeData.amount + data.amount
          },
        },
      );
  } else {
    await collection.insertOne(data);
  }



  return NextResponse.json("", { status: 200 });

}

const sendNotification = async (params:any) => {
  const notification = db.collection("mmosh-app-notifications");
  const notificationDetail = await notification.findOne({
      sender: params.sender,
      receiver: params.receiver,
      type: params.type
  });

  if(!notificationDetail) {
      await notification.insertOne(params)
  }
}

const saveStake = async (params:any) => {
  const { coin, reward, wallet } = params;
  const ptv = await db.collection("mmosh-app-ptv").findOne({
    wallet,
  });

  if (!ptv) {
    await db.collection("mmosh-app-ptv").insertOne({
      wallet,
      coin,
      reward: reward,
      claimed: 0,
      available: 0,
      swapped: 0,
      created_date: new Date(),
      updated_date: new Date(),
    });
  } else {
      await db.collection("mmosh-app-ptv").updateOne(
        {
          _id: ptv._id,
        },
        {
          $set: {
            reward: ptv.reward + reward,
          },
        },
      );
  }
}