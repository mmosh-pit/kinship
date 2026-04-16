import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const collection = db.collection("mmosh-app-lineage");

    const { searchParams } = new URL(req.url);
    const param = searchParams.get("profile");

    if (!param) {
      return NextResponse.json("Invalid Request", { status: 400 });
    }

    const res = await collection.findOne({
      profile: param,
    });
    console.log(res,"res =============================>")
    return NextResponse.json(
      {
        status: res?.lineage !== undefined,
        result: res?.lineage !== undefined ? res?.lineage : {},
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: false,
        result: {},
      },
      {
        status: 200,
      }
    );
  }
}
