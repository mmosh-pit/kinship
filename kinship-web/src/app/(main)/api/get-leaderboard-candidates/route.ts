import { db } from "@/app/(main)/lib/mongoClient";
import { NextRequest, NextResponse } from "next/server";

const OTHER_PARTIES = ["CON", "UNK", "DFL", "CONST", "UN"];

export async function GET(req: NextRequest) {
  const collection = db.collection("candidates");

  const { searchParams } = new URL(req.url);
  const searchText = searchParams.get("search") as string;
  const typesParam = searchParams.get("types") as string;
  const partiesParams = searchParams.get("parties") as string;
  const page = searchParams.get("page") as string;
  const count = searchParams.get("count") as string;
  const currentPage = page ? Number(page) : 0;

  if (typesParam === "") return NextResponse.json([]);

  const candidateTypes = typesParam?.split(",") ?? [];

  const partiesTypes = partiesParams?.split(",") ?? [];

  const stateFilter = searchParams.get("state") as string;
  const districtFilter = searchParams.get("district") as string;

  const filterCondition: any = {};

  const candidateTypeRegex = candidateTypes.map((val) => new RegExp(`^${val}`));

  if (searchText !== "") {
    filterCondition.$or = [
      {
        REGION: {
          $regex: new RegExp(searchText, "ig"),
        },
      },

      {
        CANDIDATE_NAME: {
          $regex: new RegExp(searchText, "ig"),
        },
      },
    ];
  }

  if (candidateTypes.length > 0) {
    filterCondition.$and = [
      {
        CANDIDATE_ID: {
          $in: candidateTypeRegex,
        },
      },
    ];
  }

  if (stateFilter) {
    filterCondition.$and = [
      ...(filterCondition.$and || []),
      {
        REG_ABBR: stateFilter,
      },
    ];
  }

  if (districtFilter) {
    filterCondition.$and = [
      ...(filterCondition.$and || []),
      {
        DISTRICT: Number(districtFilter),
      },
    ];
  }

  if (partiesTypes.length > 0) {
    const otherParties = partiesTypes.filter((val) => val !== "OTHER");
    const containsOther = partiesTypes.includes("OTHER");

    filterCondition.$and = [
      ...(filterCondition.$and || []),
      {
        $or: [
          {
            PARTY: {
              $in: otherParties,
            },
          },
          {
            PARTY: {
              $in: containsOther ? OTHER_PARTIES : [],
            },
          },
        ],
      },
    ];
  }

  const candidates = await collection
    .find(filterCondition, {})
    .limit(Number(count) ?? 10)
    .skip((Number(count) ?? 10) * currentPage)
    .toArray();

  return NextResponse.json(candidates);
}
