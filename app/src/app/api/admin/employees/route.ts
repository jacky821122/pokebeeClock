import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { listAllEmployees, addEmployee, updateEmployee } from "@/lib/sheets";

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

function validPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

function validRole(role: unknown): role is "full_time" | "hourly" {
  return role === "full_time" || role === "hourly";
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const employees = await listAllEmployees();
    return NextResponse.json(employees);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to list employees" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { name, pin, role } = body as { name?: string; pin?: string; role?: string };
    if (!name || !name.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    if (!validPin(pin)) return NextResponse.json({ error: "PIN 必須為 4 位數字" }, { status: 400 });
    if (!validRole(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    const existing = await listAllEmployees();
    if (existing.some((e) => e.name === name.trim())) {
      return NextResponse.json({ error: "員工名稱已存在" }, { status: 409 });
    }
    await addEmployee(name.trim(), hashPin(pin), role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add employee" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { name, pin, role, active } = body as {
      name?: string;
      pin?: string;
      role?: string;
      active?: boolean;
    };
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const patch: Parameters<typeof updateEmployee>[1] = {};
    if (pin !== undefined && pin !== "") {
      if (!validPin(pin)) return NextResponse.json({ error: "PIN 必須為 4 位數字" }, { status: 400 });
      patch.pinHash = hashPin(pin);
    }
    if (role !== undefined) {
      if (!validRole(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      patch.role = role;
    }
    if (active !== undefined) patch.active = Boolean(active);

    await updateEmployee(name, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Failed to update employee";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
