import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const collection = db.collection("mmosh-app-transaction-history");
    const { searchParams } = new URL(req.url);

    const wallet = searchParams.get("wallet");
    const category = searchParams.get("category") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const isDescending = searchParams.get("isDescending");
    const skip = (page - 1) * limit;
    const total = await collection.countDocuments({ wallet: wallet });
    let filter: any = { wallet: wallet };

    if (category.trim().length > 0) {
      filter = { wallet: wallet, transactionType: category };
    }
 
    const transactions = await collection
      .find(filter)
      .sort({ updated_date: isDescending === "newest" ? -1 : 1 }) //desc
      .skip(skip)
      .limit(limit)
      .toArray();

    
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    console.log(transactions,"transactions ----------------------------")
    return NextResponse.json(
      {
        status: true,
        message: "Transaction history retrieved successfully",
        result: {
          transactions,
          pagination: {
            current: page,
            total: totalPages,
            hasNext: hasNextPage,
            hasPrev: hasPrevPage,
            count: transactions.length,
            totalRecords: total,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: false,
        message: "Internal server error",
        result: null,
      },
      { status: 500 }
    );
  }
}
