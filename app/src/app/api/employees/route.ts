import { NextResponse } from "next/server";
import { getActiveEmployees } from "@/lib/sheets";

export async function GET() {
  try {
    const employees = await getActiveEmployees();
    return NextResponse.json(employees);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
  }
}
