import { db } from "../../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const collection = db.collection("mmosh-app-project-offer");

  const { 
    name, 
    symbol, 
    image, 
    inviteimage, 
    invitationype,
    desc, 
    key,
    lut,
    priceonetime, 
    priceyearly, 
    pricemonthly, 
    pricetype, 
    distribution,
    discount,
    project,
    creator,
    badge,
    supply
} = await req.json();

  const launchpass = await collection.findOne({
    key: key,
  });

  if (!launchpass) {
    await collection.insertOne({
        name, 
        symbol, 
        image, 
        inviteimage, 
        invitationype,
        desc, 
        key,
        lut,
        priceonetime, 
        priceyearly, 
        pricemonthly, 
        pricetype, 
        distribution,
        discount,
        project,
        creator,
        badge,
        supply,
        sold: 0,
        seniority: 0,
        created_date: new Date(),
        updated_date: new Date(),
    });
    return NextResponse.json("", { status: 200 });
  } else {
    return NextResponse.json("", { status: 200 });
  }
}