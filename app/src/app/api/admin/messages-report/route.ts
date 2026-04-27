import { NextRequest, NextResponse } from "next/server";
import { getMessageStats } from "@/lib/sheets";

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const stats = await getMessageStats();
    return NextResponse.json({ stats });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load message stats" }, { status: 500 });
  }
}
