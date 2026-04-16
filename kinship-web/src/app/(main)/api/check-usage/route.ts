import { db } from "../../lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const wallet = searchParams.get("wallet");
  const agentId = searchParams.get("agentId");
  const role = searchParams.get("role");

  if (!wallet || !role) {
    return NextResponse.json(
      { error: "Missing required parameters: wallet and role" },
      { status: 400 }
    );
  }

  try {
    const collection = db.collection("mmosh-app-usage");

    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    console.log("Date range:", { startOfDay, endOfDay });

    const aggResult = await collection
      .aggregate([
        {
          $match: {
            wallet: wallet,
            created_date: {
              $gte: startOfDay,
              $lte: endOfDay
            },
          },
        },
        {
          $group: {
            _id: null,
            total_value: { $sum: "$value" },
            count: { $sum: 1 }
          },
        },
      ])
      .toArray();

    const totalValue = aggResult.length > 0 ? aggResult[0].total_value : 0;
    const documentCount = aggResult.length > 0 ? aggResult[0].count : 0;

    let allowed = false;
    if (role === "guest") {
      allowed = totalValue < 0.2;
    } else if (role === "creator" || role === "enjoyer") {
      allowed = true;
    } else {
      return NextResponse.json(
        { error: "Invalid role. Must be 'guest', 'creator', or 'enjoyer'" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      allowed,
      totalValue,
      role,
      documentCount,
    });
  } catch (error: any) {
    console.error("Error querying MongoDB:", error);
    return NextResponse.json({
      allowed: false,
      totalValue: 0,
      role: "guest",
      error: "Database error",
    });
  }
}