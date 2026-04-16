import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet") ?? "";
  const page = searchParams.get("page") ?? "0";

  const res = await fetch(
    `${BACKEND_URL}/connections/following?wallet=${encodeURIComponent(wallet)}&page=${page}`,
  );

  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
