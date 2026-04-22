"use client";

import type { PunchKind } from "@/types";

// ── Shared types ─────────────────────────────────────────────────────────────

export interface MissingPunch {
  date: string;
  shift: string;
  missing: "in" | "out";
  existing_time: string;
}

export interface OtRecord {
  submitted_at: string;
  date: string;
  start_time: string;
  end_time: string;
  minutes: number;
  reason: string;
}

// ── Shared utilities ─────────────────────────────────────────────────────────

export function defaultSupTime(shift: string, missing: "in" | "out"): string {
  if (shift === "早班") return missing === "in" ? "10:00" : "14:00";
  return missing === "in" ? "16:00" : "20:00";
}

export function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

export function nowTaipeiLocal(): string {
  return nowTaipei().slice(0, 16);
}

export function todayTaipei(): string {
  return nowTaipei().slice(0, 10);
}

export function toClientTs(local: string): string {
  return local ? `${local}:00+08:00` : nowTaipei();
}

export function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// ── Shared UI atoms ──────────────────────────────────────────────────────────

export function DirectionButton({ label, emoji, suggested, onClick }: { label: string; emoji: string; suggested: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-3 rounded-2xl py-6 text-2xl font-bold shadow-sm transition-all active:scale-95 ${
        suggested ? "bg-stone-800 text-white ring-4 ring-stone-300" : "bg-white text-gray-700"
      }`}>
      <span>{emoji}</span><span>{label}</span>
      {suggested && <span className="text-xs font-normal opacity-70">（建議）</span>}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label className="mb-1 block text-sm font-medium text-gray-600">{label}</label>{children}</div>);
}

export function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
        active ? "bg-stone-800 text-white" : "bg-stone-100 text-gray-500"
      }`}>
      {children}
    </button>
  );
}
