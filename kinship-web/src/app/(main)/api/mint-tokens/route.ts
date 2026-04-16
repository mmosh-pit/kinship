import { mintTokens } from "../../../../utils/mintTokens";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { publicKey, points } = await req.json();

  const successfull = await mintTokens(publicKey, Number(points));

  if (!successfull) {
    return NextResponse.json("Error while transferring points", {
      status: 400,
    });
  }
  return NextResponse.json("Points transferred to wallet", { status: 200 });
}
