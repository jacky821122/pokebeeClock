import { NextRequest, NextResponse } from "next/server";
import { getActiveMessages, appendMessageResponse, type Message } from "@/lib/sheets";
import { checkDevice } from "@/lib/device";
import { nowTaipei } from "@/lib/time";

function pickWeighted(items: Message[]): Message | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, i) => sum + Math.max(i.weight, 0), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(item.weight, 0);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export async function GET(req: NextRequest) {
  const dev = await checkDevice(req);
  if (!dev.ok) return dev.res;

  const messages = await getActiveMessages();
  const picked = pickWeighted(messages);
  // Sentinel: a row with text === "NONE" lets the manager allocate weight to
  // "show no boss message" without the client inventing fallback behavior.
  const text = picked && picked.text !== "NONE" ? picked.text : null;
  return NextResponse.json({ text });
}

export async function POST(req: NextRequest) {
  const dev = await checkDevice(req);
  if (!dev.ok) return dev.res;

  const body = await req.json();
  const { employee, message_text, response } = body as {
    employee?: string;
    message_text?: string;
    response?: string;
  };

  if (!employee || !message_text || !response) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await appendMessageResponse({
    employee,
    message_text,
    response,
    timestamp: nowTaipei(),
  });
  return NextResponse.json({ ok: true });
}
