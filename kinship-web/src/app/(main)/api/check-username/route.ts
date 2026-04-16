import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username") ?? "";

  const res = await fetch(
    `${BACKEND_URL}/check-username?username=${encodeURIComponent(username)}`,
  );

  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
