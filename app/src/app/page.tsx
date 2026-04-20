"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import PinPad from "@/components/PinPad";
import type { PunchKind } from "@/types";

type View = "pin" | "menu" | "punch" | "supplement" | "overtime" | "success";

interface MissingPunch {
  date: string;
  shift: string;
  missing: "in" | "out";
}

function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

function nowTaipeiLocal(): string {
  return nowTaipei().slice(0, 16);
}

function todayTaipei(): string {
  return nowTaipei().slice(0, 10);
}

function toClientTs(local: string): string {
  return local ? `${local}:00+08:00` : nowTaipei();
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export default function Home() {
  const [view, setView] = useState<View>("pin");
  const [pin, setPin] = useState("");
  const [employee, setEmployee] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<PunchKind>("in");
  const [missingPunches, setMissingPunches] = useState<MissingPunch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinKey, setPinKey] = useState(0);
  const [successMsg, setSuccessMsg] = useState("");
  const [customTs, setCustomTs] = useState("");
  const [supDate, setSupDate] = useState("");
  const [supKind, setSupKind] = useState<PunchKind>("in");
  const [supTime, setSupTime] = useState("09:00");
  const [otDate, setOtDate] = useState("");
  const [otStart, setOtStart] = useState("18:00");
  const [otEnd, setOtEnd] = useState("19:00");

  const beeClicks = useRef(0);
  const beeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  function resetToPin() {
    setView("pin"); setPin(""); setEmployee(null); setError(null);
    setMissingPunches([]); setPinKey((k) => k + 1);
  }

  async function handlePin(enteredPin: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: enteredPin }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "PIN 不正確"); setPinKey((k) => k + 1); return; }
      setPin(enteredPin); setEmployee(data.employee);
      setSuggested(data.suggested_kind ?? "in");
      setMissingPunches(data.missing_punches ?? []);
      setCustomTs(nowTaipeiLocal()); setSupDate(todayTaipei()); setOtDate(todayTaipei());
      setView("menu");
    } catch { setError("網路錯誤，請再試一次"); setPinKey((k) => k + 1); }
    finally { setLoading(false); }
  }

  function showSuccess(msg: string, delayMs = 2500) {
    setSuccessMsg(msg); setView("success"); setTimeout(resetToPin, delayMs);
  }

  function handlePunch(k: PunchKind) {
    if (!employee) return;
    showSuccess(`${employee}・${k === "in" ? "上班" : "下班"}打卡成功`);
    fetch("/api/punch", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, client_ts: toClientTs(customTs), kind: k }),
    }).catch(() => {});
  }

  async function handleSupplement() {
    if (!employee || !supDate || !supTime) return;
    setLoading(true);
    const client_ts = `${supDate}T${supTime}:00+08:00`;
    try {
      const res = await fetch("/api/punch", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, client_ts, kind: supKind, source: "supplement" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "補登失敗"); return; }
      showSuccess(`${employee}・${supDate} 補登${supKind === "in" ? "上班" : "下班"}成功`);
    } catch { setError("網路錯誤"); } finally { setLoading(false); }
  }

  async function handleOvertime() {
    if (!employee || !otDate || !otStart || !otEnd) return;
    setLoading(true);
    try {
      const res = await fetch("/api/overtime", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, date: otDate, start_time: otStart, end_time: otEnd }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "申請失敗"); return; }
      showSuccess(`${employee}・${otDate} 加班 ${data.minutes} 分鐘 申請成功`);
    } catch { setError("網路錯誤"); } finally { setLoading(false); }
  }

  function prefillFromMissing(mp: MissingPunch) {
    setSupDate(mp.date); setSupKind(mp.missing);
    setSupTime(mp.missing === "in" ? "09:00" : "18:00"); setView("supplement");
  }

  function handleBeeClick() {
    beeClicks.current += 1;
    if (beeTimer.current) clearTimeout(beeTimer.current);
    if (beeClicks.current >= 5) { beeClicks.current = 0; router.push("/admin"); }
    else { beeTimer.current = setTimeout(() => { beeClicks.current = 0; }, 3000); }
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      <div className="bg-stone-800 px-4 py-4 flex items-center gap-3">
        <button onClick={handleBeeClick} className="text-2xl select-none">🐝</button>
        <h1 className="text-lg font-bold text-white">pokebee 打卡</h1>
        <span className="ml-auto text-xs text-stone-500">{process.env.NEXT_PUBLIC_BUILD_SHA}</span>
      </div>

      <main className="mx-auto w-full max-w-lg px-4 py-6">
        {view === "pin" && (
          <div className="flex items-center justify-center pt-4">
            <PinPad key={pinKey} onConfirm={handlePin} onCancel={null} loading={loading} error={error} />
          </div>
        )}

        {view === "menu" && employee && (
          <div className="flex flex-col items-center gap-6 pt-6">
            <p className="text-2xl font-bold text-gray-800">{employee}</p>
            {missingPunches.length > 0 && (
              <div className="w-full max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-semibold text-amber-800">⚠️ 缺卡紀錄</p>
                {missingPunches.map((mp, i) => (
                  <button key={i} onClick={() => prefillFromMissing(mp)}
                    className="mb-1 block w-full rounded-lg bg-amber-100 px-3 py-2 text-left text-sm text-amber-900 transition-colors hover:bg-amber-200">
                    {mp.date} {mp.shift} — 缺{mp.missing === "in" ? "上班" : "下班"}打卡
                    <span className="ml-2 text-xs text-amber-600">點擊補登 →</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex w-full max-w-sm flex-col gap-3">
              <MenuButton label="打卡" emoji="⏰" desc="上班 / 下班" onClick={() => setView("punch")} />
              <MenuButton label="補登打卡" emoji="📝" desc="補登缺少的打卡" onClick={() => setView("supplement")} />
              <MenuButton label="加班申請" emoji="🕐" desc="申報加班時數" onClick={() => setView("overtime")} />
            </div>
            <button onClick={resetToPin} className="text-sm text-gray-400 underline-offset-2 hover:underline">取消</button>
          </div>
        )}

        {view === "punch" && employee && (
          <div className="flex flex-col items-center gap-8 pt-10">
            <p className="text-2xl font-bold text-gray-800">{employee}</p>
            <div className="w-full max-w-sm">
              <label className="mb-1 block text-xs text-gray-400">打卡時間（測試用）</label>
              <input type="datetime-local" value={customTs} onChange={(e) => setCustomTs(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
            </div>
            <p className="text-sm text-gray-500">選擇打卡類型</p>
            <div className="flex w-full max-w-sm flex-col gap-4">
              <DirectionButton label="上班" emoji="🟢" suggested={suggested === "in"} onClick={() => handlePunch("in")} />
              <DirectionButton label="下班" emoji="🔴" suggested={suggested === "out"} onClick={() => handlePunch("out")} />
            </div>
            <button onClick={() => setView("menu")} className="text-sm text-gray-400 underline-offset-2 hover:underline">返回</button>
          </div>
        )}

        {view === "supplement" && employee && (
          <div className="flex flex-col items-center gap-6 pt-8">
            <p className="text-2xl font-bold text-gray-800">{employee}・補登打卡</p>
            {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            <div className="w-full max-w-sm space-y-4">
              <Field label="日期">
                <input type="date" value={supDate} onChange={(e) => setSupDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
              </Field>
              <Field label="類型">
                <div className="flex gap-3">
                  <ToggleBtn active={supKind === "in"} onClick={() => setSupKind("in")}>上班</ToggleBtn>
                  <ToggleBtn active={supKind === "out"} onClick={() => setSupKind("out")}>下班</ToggleBtn>
                </div>
              </Field>
              <Field label="時間">
                <input type="time" value={supTime} onChange={(e) => setSupTime(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
              </Field>
              <button onClick={handleSupplement} disabled={loading}
                className="w-full rounded-2xl bg-stone-800 py-4 text-lg font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50">
                {loading ? "送出中…" : "送出補登"}
              </button>
            </div>
            <button onClick={() => { setError(null); setView("menu"); }} className="text-sm text-gray-400 underline-offset-2 hover:underline">返回</button>
          </div>
        )}

        {view === "overtime" && employee && (
          <div className="flex flex-col items-center gap-6 pt-8">
            <p className="text-2xl font-bold text-gray-800">{employee}・加班申請</p>
            {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            <div className="w-full max-w-sm space-y-4">
              <Field label="日期">
                <input type="date" value={otDate} onChange={(e) => setOtDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
              </Field>
              <Field label="開始時間">
                <input type="time" value={otStart} onChange={(e) => setOtStart(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
              </Field>
              <Field label="結束時間">
                <input type="time" value={otEnd} onChange={(e) => setOtEnd(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700" />
              </Field>
              {otStart && otEnd && (() => {
                const diff = hmToMin(otEnd) - hmToMin(otStart);
                const rounded = diff > 0 ? Math.floor(diff / 15) * 15 : 0;
                return rounded > 0 ? (
                  <p className="text-center text-sm text-gray-500">
                    加班時數：<span className="font-semibold text-gray-800">{rounded} 分鐘</span>（{(rounded / 60).toFixed(1)} 小時）
                  </p>
                ) : null;
              })()}
              <button onClick={handleOvertime} disabled={loading}
                className="w-full rounded-2xl bg-stone-800 py-4 text-lg font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50">
                {loading ? "送出中…" : "送出申請"}
              </button>
            </div>
            <button onClick={() => { setError(null); setView("menu"); }} className="text-sm text-gray-400 underline-offset-2 hover:underline">返回</button>
          </div>
        )}

        {view === "success" && (
          <div className="flex flex-col items-center justify-center gap-4 pt-16 text-center">
            <div className="text-6xl">✅</div>
            <p className="text-xl font-bold text-gray-800">{successMsg}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function MenuButton({ label, emoji, desc, onClick }: { label: string; emoji: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-4 rounded-2xl bg-white px-5 py-5 shadow-sm transition-all active:scale-[0.98] hover:bg-stone-100">
      <span className="text-2xl">{emoji}</span>
      <div className="text-left">
        <p className="text-lg font-bold text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
    </button>
  );
}

function DirectionButton({ label, emoji, suggested, onClick }: { label: string; emoji: string; suggested: boolean; onClick: () => void }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label className="mb-1 block text-sm font-medium text-gray-600">{label}</label>{children}</div>);
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${
        active ? "bg-stone-800 text-white" : "bg-stone-100 text-gray-500"
      }`}>
      {children}
    </button>
  );
}
