import { NextResponse } from "next/server";
import { serverAuthClient } from "../../../lib/auth";

/** Ends the session. A POST, because it changes state. */
export async function POST(request: Request) {
  const client = await serverAuthClient();
  await client?.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
}
