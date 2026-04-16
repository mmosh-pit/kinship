import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  await fetch(`${BACKEND_URL}/log-data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);

  return NextResponse.json("", { status: 200 });
}
