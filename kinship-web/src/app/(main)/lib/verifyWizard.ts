import { NextRequest, NextResponse } from "next/server";

/**
 * Verify that the request comes from a wizard user.
 * Returns the user document if valid, or a NextResponse error.
 */
export async function verifyWizard(
  _req: NextRequest,
): Promise<
  | { user: Record<string, unknown>; error?: never }
  | { user?: never; error: NextResponse }
> {
  const authorization = _req.headers.get("authorization");
  console.log("Aurhotization: ", authorization);

  if (!authorization) {
    return {
      error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BACKEND_URL}/is-auth`,
    {
      headers: {
        Authorization: authorization ?? "",
      },
    },
  );

  const data = await response.json();

  if (!data?.data?.is_auth) {
    return {
      error: NextResponse.json("", { status: 401 }),
    };
  }

  const user = data?.data?.user;

  if (user.role !== "wizard") {
    return {
      error: NextResponse.json(
        { error: "Forbidden: wizard role required" },
        { status: 403 },
      ),
    };
  }

  return { user: user as unknown as Record<string, unknown> };
}
