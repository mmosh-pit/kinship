
import { db } from "@/app/(main)/lib/mongoClient";
import { getSession } from "@/app/(main)/lib/session";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-user-wallet");
  const data = await req.json();

  try {
    let result = await collection.findOne({email: data.email});
    if(!result) {
      let baseurl = process.env.NEXT_PUBLIC_WALLET_URL + "create"
      let apiresult = await axios.post(baseurl);
      let jsonData = JSON.parse(apiresult.data.data)
      console.log("jsonData ", jsonData)
      if(apiresult.data.status) {
          await sendNotification({
              type: "key",
              message: jsonData.key_package[1],
              unread: 1,
              sender: "",
              receiver: jsonData.address,
              created_date:new Date()
          })
      }
      await collection.insertOne({
          email: data.email,
          private: jsonData.key_package[0],
          address: jsonData.address,
          created_date: new Date(),
          updated_date: new Date(),
      });
      result = await collection.findOne({email: data.email});
    }
  
    const session:any = await getSession();
    session.user = {
      id: data._id,
      email: data.email,
    };
    await session.save();
    return NextResponse.json("");
  } catch (error) {
    console.log("error ", error)
    return NextResponse.json("");
  }

}

const sendNotification = async (params:any) => {
    const notification = db.collection("mmosh-app-notifications");
    const notificationDetail = await notification.findOne({
        receiver: params.receiver,
        type: params.type
    });

    if(!notificationDetail) {
        await notification.insertOne(params)
    }
}
