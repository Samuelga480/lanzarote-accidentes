import { NextResponse } from "next/server";
import { clearUserSession } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

/** Cierre de sesion. La cookie se borra; no hay nada mas que invalidar. */
export async function POST() {
  await clearUserSession();
  return NextResponse.json({ ok: true });
}