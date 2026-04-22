"use client";

import { useState } from "react";
import type { PunchKind } from "@/types";
import { DirectionButton, todayTaipei, toClientTs, defaultSupTime } from "./shared";
import type { MissingPunch } from "./shared";

interface PunchViewProps {
  employee: string;
  pin: string;
  suggested: PunchKind;
  missingPunches: MissingPunch[];
  customTs: string;
  onCustomTsChange: (v: string) => void;
  onPunch: (kind: PunchKind) => void;
  onSupplement: (date: string, kind: PunchKind, time: string, context: MissingPunch | null) => void;
  onGoOvertime: () => void;
  onCancel: () => void;
  setMissingPunches: React.Dispatch<React.SetStateAction<MissingPunch[]>>;
}

export default function PunchView({
  employee, suggested, missingPunches,
  customTs, onCustomTsChange,
  onPunch, onSupplement, onGoOvertime, onCancel,
}: PunchViewProps) {

  function prefillFromMissing(mp: MissingPunch) {
    onSupplement(mp.date, mp.missing, defaultSupTime(mp.shift, mp.missing), mp);
  }

  return (
    <div className="flex flex-col items-center gap-6 pt-6">
      <p className="text-2xl font-bold text-gray-800">{employee}</p>

      {missingPunches.length > 0 && (
        <div className="w-full max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">⚠️ 缺卡紀錄</p>
          {missingPunches.map((mp, i) => (
            <button key={i} onClick={() => prefillFromMissing(mp)}
              className="mb-1 block w-full rounded-lg bg-amber-100 px-3 py-2 text-left text-sm text-amber-900 transition-colors hover:bg-amber-200">
              {mp.date} {mp.shift} — 缺{mp.missing === "in" ? "上班" : "下班"}打卡
              {mp.existing_time && (
                <span className="ml-1 text-xs text-amber-700">（已有{mp.missing === "out" ? "上班" : "下班"} {mp.existing_time}）</span>
              )}
              <span className="ml-2 text-xs text-amber-600">點擊補登 →</span>
            </button>
          ))}
        </div>
      )}

      <div className="w-full max-w-sm">
        <label className="mb-1 block text-xs text-gray-400">打卡時間（測試用）</label>
        <input type="datetime-local" value={customTs} onChange={(e) => onCustomTsChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
      </div>
      <p className="text-sm text-gray-500">選擇打卡類型</p>
      <div className="flex w-full max-w-sm flex-col gap-4">
        <DirectionButton label="上班" emoji="🟢" suggested={suggested === "in"} onClick={() => onPunch("in")} />
        <DirectionButton label="下班" emoji="🔴" suggested={suggested === "out"} onClick={() => onPunch("out")} />
      </div>

      <div className="flex w-full max-w-sm gap-3 pt-2">
        <button onClick={() => onSupplement(todayTaipei(), "in", "10:00", null)}
          className="flex-1 rounded-xl bg-white px-3 py-3 text-sm font-medium text-gray-600 shadow-sm transition-all hover:bg-stone-100 active:scale-[0.98]">
          📝 補登打卡
        </button>
        <button onClick={onGoOvertime}
          className="flex-1 rounded-xl bg-white px-3 py-3 text-sm font-medium text-gray-600 shadow-sm transition-all hover:bg-stone-100 active:scale-[0.98]">
          🕐 加班申請
        </button>
      </div>

      <button onClick={onCancel} className="text-sm text-gray-400 underline-offset-2 hover:underline">取消</button>
    </div>
  );
}
