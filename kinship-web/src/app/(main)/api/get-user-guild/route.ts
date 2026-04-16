import { Guild, GuildFilter } from "@/app/(main)/models/guild";
import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

const gensMap = {
  gen1: "lineage.promotor",
  gen2: "lineage.scout",
  gen3: "lineage.recruitor",
  gen4: "lineage.originator",
};

export async function GET(req: NextRequest) {
  const collection = db.collection("mmosh-app-lineage");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("address");
  const gens = searchParams.get("gens");
  const connections = searchParams.get("connection");
  const skip = searchParams.get("skip");
  const sortValue = searchParams.get("sort") as string;
  const sortDirection = searchParams.get("sortDir") as string;
  const requester = searchParams.get("requester") as string;

  if (!param || !gens || !skip || !sortValue || !sortDirection || !connections) {
    return NextResponse.json("Invalid Payload", { status: 400 });
  }

  const gensDecoded: GuildFilter[] = gens.split(",") as GuildFilter[];
  const connectionOptions = connections.split(",")

  const filter = {
    $or: [] as Guild[],
  };

  gensDecoded.forEach((gen) => {
    filter.$or.push({ [gensMap[gen]]: param });
  });

  const guilds = await collection
    .find<{ lineage: Guild; profile: string }>(filter, {
      projection: {
        _id: 0,
        lineage: 1,
        profile: 1,
      },
    })
    .toArray();

  const lineagesMap: any = {};

  for (const value of guilds) {
    let lineageValue = "";

    if (value.lineage.promotor === param) {
      lineageValue = "promotor";
    }

    if (value.lineage.scout === param && lineageValue !== "") {
      lineageValue = "scout";
    }

    if (value.lineage.recruitor === param && lineageValue !== "") {
      lineageValue = "recruitor";
    }

    if (value.lineage.originator === param && lineageValue !== "") {
      lineageValue = "originator";
    }

    lineagesMap[value.profile] = lineageValue;
  }

  let profileArray = Object.keys(lineagesMap);
  for (let index = 0; index < connectionOptions.length; index++) {
    const element:any = connectionOptions[index];
    let params;
    if (element === "unlinked") {
        params = {
          sender: requester,
          status: 3
        };
    } else if (element === "follower") {
      params = {
        receiver: requester,
        status: 1
      };
    } else if (element === "following") {
      params = {
        sender: requester,
        status: 1
      };
    } else if (element === "linked") { 
      params = {
        sender: requester,
        status: 2
      };
    }
    if(params) {
      let match = {$match: params};
      const connectArray = await db
      .collection("mmosh-app-connections")
      .aggregate([
       match,
        {
          $lookup: {
            from: "users",
            localField: "receiver_id",
            foreignField: "wallet",
            as: "receiver",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "sender_id",
            foreignField: "wallet",
            as: "sender",
          },
        },
        {
          $project: {
            key: 1,
            created_date: 1,
            receiver: "$receiver",
            sender: "$sender",
          },
        },
      ])
      .toArray();
  
      for (let index = 0; index < connectArray.length; index++) {
        const connectionObj = connectArray[index];
        let user;
        if (element === "follower") {
          user = connectionObj.sender
        } else {
          user = connectionObj.receiver
        }
          if(!profileArray.includes(user.wallet)) {
            profileArray.push(user.wallet)
          }
        
      }
    }
  }
    

  const profilesFilter = {
    wallet: { $in: profileArray },
  };

  const sortDirectionValue = sortDirection === "desc" ? -1 : 1;

  const profiles = await db
    .collection("users")
    .find(profilesFilter, {
      projection: {
        _id: 0,
        wallet: 1,
        profile: 1,
        royalty: 1,
        "telegram.username": 1,
        "telegram.points": 1,
        "twitter.username": 1,
      },
    })
    .sort({ [sortValue]: sortDirectionValue })
    .skip(Number(skip))
    .limit(10)
    .toArray();

  for (const value of profiles) {
    value.lineageValue = lineagesMap[value.wallet];
  }

  if(requester) {
    const user = await db.collection("users").findOne(
      {
       wallet: requester,
      }
    );
    if(user) {
      if (user.wallet) {
        for (let index = 0; index < profiles.length; index++) {
          profiles[index].profile.connection = await getConnectionStatus(user, profiles[index])
          profiles[index].profile.request = await getHasRequest(user, profiles[index])
        }
      }
    }
  }

  return NextResponse.json(profiles, {
    status: 200,
  });
}


const getConnectionStatus = async (requester:any, user:any) => {
  if(requester.wallet !== user.wallet) {
   // check has linked
   const hasLinked = await db.collection("mmosh-app-connections").findOne(
     {
      sender: requester.wallet,
      receiver: user.wallet,
      status: 2
     }
   );
   if(hasLinked) {
     return 4
   }

   // check has outbound
   const hasfollowing = await db.collection("mmosh-app-connections").findOne(
     {
      sender: requester.wallet,
      receiver: user.wallet,
      status: 1
     }
   );

   if(hasfollowing) {
     return 2
   }

   // check has inbound
   const hasfollower = await db.collection("mmosh-app-connections").findOne(
     {
       sender: user.wallet,
       receiver: requester.wallet,
       status: 1
     }
   );

   if(hasfollower) {
     return 3
   }




   // check has idle connection
   const hasRequest = await db.collection("mmosh-app-connections").findOne(
     {
       sender: requester.wallet,
       receiver: user.wallet,
       status: 0
     }
   );

   if(hasRequest) {
     return 1
   }
   
   // check has idle connection
   const hasConnection = await db.collection("mmosh-app-connections").findOne(
     {
       sender: requester.wallet,
       receiver: user.wallet,
       status: 3
     }
   );

   if(hasConnection) {
     return 5
   }
  }
  return 0
}

const getHasRequest = async (requester:any, user:any) => {
 if(requester.wallet !== user.wallet) {
  // check has linked
  const hasRequest = await db.collection("mmosh-app-connections").findOne(
    {
     sender: user.wallet,
     receiver: requester.wallet,
     status: 0
    }
  );
  if(hasRequest) {
    return true
  }
 }

  return false
}