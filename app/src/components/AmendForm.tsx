"use client";

import { useState } from "react";

interface Props {
  employees: string[];
}

export default function AmendForm({ employees }: Props) {
  const [employee, setEmployee] = useState("");
  const [date, setDate] = useState("");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/amend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee, date, in_time: inTime, out_time: outTime, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "補登失敗");
        setResult("error");
      } else {
        setResult("success");
        setInTime("");
        setOutTime("");
        setReason("");
      }
    } catch {
      setErrorMsg("網路錯誤，請再試一次");
      setResult("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">員工</label>
        <select
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          required
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">請選擇</option>
          {employees.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">日期</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-full min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className="mb-1 block text-sm font-medium text-gray-700">上班時間</label>
          <input
            type="time"
            value={inTime}
            onChange={(e) => setInTime(e.target.value)}
            required
            className="w-full min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm"
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-sm font-medium text-gray-700">下班時間</label>
          <input
            type="time"
            value={outTime}
            onChange={(e) => setOutTime(e.target.value)}
            required
            className="w-full min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">原因</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="例：忘記打卡"
          className="w-full min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm"
        />
      </div>

      {result === "success" && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700">補登申請已送出，待管理者審核</p>
      )}
      {result === "error" && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-stone-800 py-3 text-sm font-semibold text-white disabled:opacity-50 active:bg-stone-700"
      >
        {loading ? "送出中…" : "送出補登申請"}
      </button>
    </form>
  );
}
