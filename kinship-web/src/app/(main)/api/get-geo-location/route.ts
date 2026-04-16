import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function GET(req: NextRequest) {
  const res = await fetch(`${BACKEND_URL}/get-geo-location`, {
    headers: {
      "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "",
      "x-real-ip": req.headers.get("x-real-ip") ?? "",
    },
  });

  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}
