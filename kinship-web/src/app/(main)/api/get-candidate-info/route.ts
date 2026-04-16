import { db } from "@/app/(main)/lib/mongoClient";
import { Candidate } from "@/app/(main)/models/candidate";
import { CandidateInfo } from "@/app/(main)/models/candidateInfo";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const collection = db.collection("candidates");

  const { searchParams } = new URL(req.url);
  const param = searchParams.get("candidate");

  const candidate = await collection.findOne<Candidate>({
    CANDIDATE_ID: param,
  });

  if (!candidate) {
    return NextResponse.json("", { status: 404 });
  }

  let firstOponent: Candidate | null = null;

  const response: CandidateInfo = {
    candidate,
    firstOponent: firstOponent,
    secondOponent: null,
  };

  if (candidate.PARTY == "DEM") {
    firstOponent = await collection.findOne<Candidate>({
      PARTY: "REP",
      CANDIDATE_ID: {
        $regex: new RegExp(`^${candidate.CANDIDATE_ID.at(0)}`, "i"),
      },
      DISTRICT: candidate.DISTRICT,
      REGION: candidate.REGION,
    });
  } else if (candidate.PARTY == "REP") {
    firstOponent = await collection.findOne<Candidate>({
      PARTY: "DEM",
      CANDIDATE_ID: {
        $regex: new RegExp(`^${candidate.CANDIDATE_ID.at(0)}`, "i"),
      },
      DISTRICT: candidate.DISTRICT,
      REGION: candidate.REGION,
    });
  } else {
    firstOponent = await collection.findOne<Candidate>({
      PARTY: { $not: { $eq: candidate.PARTY } },
      CANDIDATE_ID: {
        $regex: new RegExp(`^${candidate.CANDIDATE_ID.at(0)}`, "i"),
      },
      DISTRICT: candidate.DISTRICT,
      REGION: candidate.REGION,
    });
  }

  if (!firstOponent) {
    return NextResponse.json(response, { status: 200 });
  }

  response.firstOponent = firstOponent;

  const secondOponent = await collection.findOne<Candidate>({
    PARTY: {
      $not: {
        $in: [firstOponent!.PARTY, candidate!.PARTY],
      },
    },
    CANDIDATE_ID: {
      $regex: new RegExp(`^${candidate.CANDIDATE_ID.at(0)}`, "i"),
    },
    DISTRICT: candidate.DISTRICT,
    REGION: candidate.REGION,
  });

  response.secondOponent = secondOponent;

  return NextResponse.json(response, { status: 200 });
}
