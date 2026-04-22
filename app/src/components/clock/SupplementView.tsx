"use client";

import { useState } from "react";
import type { PunchKind } from "@/types";
import { Field, ToggleBtn } from "./shared";
import type { MissingPunch } from "./shared";

interface SupplementViewProps {
  employee: string;
  loading: boolean;
  error: string | null;
  supDate: string;
  supKind: PunchKind;
  supTime: string;
  supContext: MissingPunch | null;
  onSupDateChange: (v: string) => void;
  onSupKindChange: (v: PunchKind) => void;
  onSupTimeChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function SupplementView({
  employee, loading, error,
  supDate, supKind, supTime, supContext,
  onSupDateChange, onSupKindChange, onSupTimeChange,
  onSubmit, onBack,
}: SupplementViewProps) {
  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <p className="text-2xl font-bold text-gray-800">{employee}・補登打卡</p>
      {error && <p className="text-sm font-medium text-red-500">{error}</p>}

      {supContext && supContext.existing_time && (
        <div className="w-full max-w-sm rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            📋 {supContext.date} {supContext.shift}
            {" "}已有<span className="font-semibold">{supContext.missing === "out" ? "上班" : "下班"}</span>紀錄：
            <span className="font-bold">{supContext.existing_time}</span>
          </p>
          <p className="mt-1 text-xs text-blue-600">
            請補登{supContext.missing === "in" ? "上班" : "下班"}時間
          </p>
        </div>
      )}

      <div className="w-full max-w-sm space-y-4">
        <Field label="日期">
          <input type="date" value={supDate} onChange={(e) => onSupDateChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
        </Field>
        <Field label="類型">
          <div className="flex gap-3">
            <ToggleBtn active={supKind === "in"} onClick={() => onSupKindChange("in")}>上班</ToggleBtn>
            <ToggleBtn active={supKind === "out"} onClick={() => onSupKindChange("out")}>下班</ToggleBtn>
          </div>
        </Field>
        <Field label="時間">
          <input type="time" value={supTime} onChange={(e) => onSupTimeChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
        </Field>
        <button onClick={onSubmit} disabled={loading}
          className="w-full rounded-2xl bg-stone-800 py-4 text-lg font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50">
          {loading ? "送出中…" : "送出補登"}
        </button>
      </div>
      <button onClick={onBack} className="text-sm text-gray-400 underline-offset-2 hover:underline">返回</button>
    </div>
  );
}
