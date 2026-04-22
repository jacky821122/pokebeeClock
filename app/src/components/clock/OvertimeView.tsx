"use client";

import { Field, hmToMin } from "./shared";
import type { OtRecord } from "./shared";

interface OvertimeViewProps {
  employee: string;
  loading: boolean;
  error: string | null;
  otDate: string;
  otStart: string;
  otEnd: string;
  otReason: string;
  otRecords: OtRecord[];
  otLoading: boolean;
  onOtDateChange: (v: string) => void;
  onOtStartChange: (v: string) => void;
  onOtEndChange: (v: string) => void;
  onOtReasonChange: (v: string) => void;
  onSubmit: () => void;
  onRevoke: (submittedAt: string) => void;
  onBack: () => void;
}

export default function OvertimeView({
  employee, loading, error,
  otDate, otStart, otEnd, otReason,
  otRecords, otLoading,
  onOtDateChange, onOtStartChange, onOtEndChange, onOtReasonChange,
  onSubmit, onRevoke, onBack,
}: OvertimeViewProps) {
  const diff = otStart && otEnd ? hmToMin(otEnd) - hmToMin(otStart) : 0;
  const rounded = diff > 0 ? Math.floor(diff / 15) * 15 : 0;

  return (
    <div className="flex flex-col items-center gap-6 pt-8">
      <p className="text-2xl font-bold text-gray-800">{employee}・加班申請</p>
      {error && <p className="text-sm font-medium text-red-500">{error}</p>}
      <div className="w-full max-w-sm space-y-4">
        <Field label="日期">
          <input type="date" value={otDate} onChange={(e) => onOtDateChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
        </Field>
        <Field label="開始時間">
          <input type="time" value={otStart} onChange={(e) => onOtStartChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
        </Field>
        <Field label="結束時間">
          <input type="time" value={otEnd} onChange={(e) => onOtEndChange(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
        </Field>
        <Field label="原因（選填）">
          <input type="text" value={otReason} onChange={(e) => onOtReasonChange(e.target.value)}
            placeholder="例：活動準備、盤點…"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
        </Field>
        {rounded > 0 && (
          <p className="text-center text-sm text-gray-500">
            加班時數：<span className="font-semibold text-gray-800">{rounded} 分鐘</span>（{(rounded / 60).toFixed(2)} 小時）
          </p>
        )}
        <button onClick={onSubmit} disabled={loading}
          className="w-full rounded-2xl bg-stone-800 py-4 text-lg font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50">
          {loading ? "送出中…" : "送出申請"}
        </button>
      </div>

      {/* Recent overtime requests */}
      <div className="w-full max-w-sm">
        <p className="mb-2 text-sm font-semibold text-gray-600">最近申請紀錄</p>
        {otLoading ? (
          <p className="text-xs text-gray-400">載入中…</p>
        ) : otRecords.length === 0 ? (
          <p className="text-xs text-gray-400">無申請紀錄</p>
        ) : (
          <div className="space-y-2">
            {otRecords.map((r) => {
              const ageMs = Date.now() - new Date(r.submitted_at).getTime();
              const canRevoke = ageMs < 24 * 60 * 60 * 1000;
              return (
                <div key={r.submitted_at} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2">
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">{r.date}</span>{" "}
                    <span className="text-gray-500">{r.start_time}-{r.end_time}</span>{" "}
                    <span className="text-xs text-gray-400">({r.minutes}分)</span>
                    {r.reason && <span className="ml-1 text-xs text-gray-400">| {r.reason}</span>}
                  </div>
                  {canRevoke ? (
                    <button onClick={() => onRevoke(r.submitted_at)} disabled={loading}
                      className="ml-2 shrink-0 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40">
                      撤回
                    </button>
                  ) : (
                    <span className="ml-2 text-xs text-gray-300">已逾時</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button onClick={onBack} className="text-sm text-gray-400 underline-offset-2 hover:underline">返回</button>
    </div>
  );
}
