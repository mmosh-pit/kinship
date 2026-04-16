import { getSession } from "@/app/(main)/lib/session";
import { NextRequest, NextResponse } from "next/server";
export async function GET() {
  const session:any = await getSession();
  if (!session.user) {
    return NextResponse.json({status: false}, {
        status: 200,
    });
  }
  return NextResponse.json({status: true}, {
    status: 200,
  });
}