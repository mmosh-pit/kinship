import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const collection = db.collection("bots");

    const { searchParams } = new URL(req.url);
    console.log("searchParams.get", searchParams.get("creator"));
    const agentInfo = await collection.find({ creator: searchParams.get("creator") }).sort("-created_Data").toArray();


    if (agentInfo.length == 0) {
        return NextResponse.json({
            status: false,
            message: "No agents found.",
            result: []
        }, { status: 200 });
    }
    return NextResponse.json({
        status: true,
        message: "Agent info retrieved successfully.",
        result: agentInfo,
    }, { status: 200 });
}