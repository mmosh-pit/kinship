import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet") ?? "";

  const res = await fetch(
    `${BACKEND_URL}/connections/list?wallet=${encodeURIComponent(wallet)}`,
  );

  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
