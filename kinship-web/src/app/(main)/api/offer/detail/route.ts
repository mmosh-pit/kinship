import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/mongoClient";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    if(!symbol) {
        return NextResponse.json(null, {
            status: 200,
        });
    }

    const offerCollection = db.collection("mmosh-app-project-offer");

    let offerData:any  = await offerCollection.findOne({ symbol: symbol?.toUpperCase() });
    if(!offerData) {

        offerData = await offerCollection.findOne({ symbol: symbol });
        if (!offerData) {
            return NextResponse.json(null, {
                status: 200,
            });
        }
    }
    return NextResponse.json(offerData, {
       status: 200,
    });
}
