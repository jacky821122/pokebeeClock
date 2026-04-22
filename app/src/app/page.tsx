"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import PinPad from "@/components/PinPad";
import PunchView from "@/components/clock/PunchView";
import SupplementView from "@/components/clock/SupplementView";
import OvertimeView from "@/components/clock/OvertimeView";
import type { PunchKind } from "@/types";
import type { MissingPunch, OtRecord } from "@/components/clock/shared";
import { nowTaipeiLocal, todayTaipei, toClientTs, hmToMin } from "@/components/clock/shared";

type View = "pin" | "punch" | "supplement" | "overtime" | "success";

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
  const [supTime, setSupTime] = useState("10:00");
  const [supContext, setSupContext] = useState<MissingPunch | null>(null);
  const [otDate, setOtDate] = useState("");
  const [otStart, setOtStart] = useState("18:00");
  const [otEnd, setOtEnd] = useState("19:00");
  const [otReason, setOtReason] = useState("");
  const [otRecords, setOtRecords] = useState<OtRecord[]>([]);
  const [otLoading, setOtLoading] = useState(false);

  const beeClicks = useRef(0);
  const beeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  function resetToPin() {
    setView("pin"); setPin(""); setEmployee(null); setError(null);
    setMissingPunches([]); setPinKey((k) => k + 1); setSupContext(null);
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
      setView("punch");
    } catch { setError("網路錯誤，請再試一次"); setPinKey((k) => k + 1); }
    finally { setLoading(false); }
  }

  function showSuccess(msg: string, delayMs = 2500) {
    setSuccessMsg(msg); setView("success"); setTimeout(resetToPin, delayMs);
  }

  /** Brief success flash, then return to punch view (stay logged in) */
  function showSuccessAndReturn(msg: string) {
    setSuccessMsg(msg); setView("success");
    setTimeout(() => { setView("punch"); setError(null); }, 1500);
  }

  function handlePunch(k: PunchKind) {
    if (!employee) return;
    showSuccess(`${employee}・${k === "in" ? "上班" : "下班"}打卡成功`);
    fetch("/api/punch", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, client_ts: toClientTs(customTs), kind: k }),
    }).catch(() => {});
  }

  function handleSupplement() {
    if (!employee || !supDate || !supTime) return;
    const client_ts = `${supDate}T${supTime}:00+08:00`;
    // Optimistic update: remove the matching missing punch from state
    setMissingPunches((prev) => prev.filter(
      (mp) => !(mp.date === supDate && mp.missing === supKind)
    ));
    showSuccessAndReturn(`${employee}・${supDate} 補登${supKind === "in" ? "上班" : "下班"}成功`);
    fetch("/api/punch", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, client_ts, kind: supKind, source: "supplement" }),
    }).catch(() => {});
  }

  function handleOvertime() {
    if (!employee || !otDate || !otStart || !otEnd) return;
    const diff = hmToMin(otEnd) - hmToMin(otStart);
    const minutes = diff > 0 ? Math.floor(diff / 15) * 15 : 0;
    if (minutes <= 0) { setError("加班時數不足 15 分鐘"); return; }
    showSuccessAndReturn(`${employee}・${otDate} 加班 ${minutes} 分鐘 申請成功`);
    fetch("/api/overtime", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, date: otDate, start_time: otStart, end_time: otEnd, reason: otReason.trim() || undefined }),
    }).catch(() => {});
  }

  async function loadOtRecords() {
    if (!pin) return;
    setOtLoading(true);
    try {
      const res = await fetch(`/api/overtime?pin=${encodeURIComponent(pin)}`);
      const data = await res.json();
      if (res.ok) setOtRecords(data.records ?? []);
    } catch { /* ignore */ }
    finally { setOtLoading(false); }
  }

  async function revokeOt(submittedAt: string) {
    if (!pin) return;
    setLoading(true);
    try {
      const res = await fetch("/api/overtime", { method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, submitted_at: submittedAt }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "撤回失敗"); return; }
      setOtRecords((prev) => prev.filter((r) => r.submitted_at !== submittedAt));
    } catch { setError("網路錯誤"); } finally { setLoading(false); }
  }

  function goToOvertime() {
    setView("overtime");
    loadOtRecords();
  }

  function handleGoSupplement(date: string, kind: PunchKind, time: string, context: MissingPunch | null) {
    setSupDate(date); setSupKind(kind); setSupTime(time); setSupContext(context);
    setView("supplement");
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

        {view === "punch" && employee && (
          <PunchView
            employee={employee} pin={pin} suggested={suggested}
            missingPunches={missingPunches} customTs={customTs}
            onCustomTsChange={setCustomTs} onPunch={handlePunch}
            onSupplement={handleGoSupplement} onGoOvertime={goToOvertime}
            onCancel={resetToPin} setMissingPunches={setMissingPunches}
          />
        )}

        {view === "supplement" && employee && (
          <SupplementView
            employee={employee} loading={loading} error={error}
            supDate={supDate} supKind={supKind} supTime={supTime} supContext={supContext}
            onSupDateChange={setSupDate} onSupKindChange={setSupKind} onSupTimeChange={setSupTime}
            onSubmit={handleSupplement}
            onBack={() => { setError(null); setSupContext(null); setView("punch"); }}
          />
        )}

        {view === "overtime" && employee && (
          <OvertimeView
            employee={employee} loading={loading} error={error}
            otDate={otDate} otStart={otStart} otEnd={otEnd} otReason={otReason}
            otRecords={otRecords} otLoading={otLoading}
            onOtDateChange={setOtDate} onOtStartChange={setOtStart}
            onOtEndChange={setOtEnd} onOtReasonChange={setOtReason}
            onSubmit={handleOvertime} onRevoke={revokeOt} onBack={() => { setError(null); setView("punch"); }}
          />
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
