"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PinPad from "@/components/PinPad";
import type { PunchKind } from "@/types";

type View = "pin" | "direction" | "success";

function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

// [temp] Returns "YYYY-MM-DDTHH:mm" in Taipei time for datetime-local input default.
function nowTaipeiLocal(): string {
  return nowTaipei().slice(0, 16);
}

// [temp] Converts datetime-local value to client_ts format.
function toClientTs(local: string): string {
  return local ? `${local}:00+08:00` : nowTaipei();
}

export default function Home() {
  const [view, setView] = useState<View>("pin");
  const [pin, setPin] = useState<string>("");
  const [employee, setEmployee] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<PunchKind>("in");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinKey, setPinKey] = useState(0);
  const [lastPunch, setLastPunch] = useState<{ employee: string; kind: PunchKind; server_ts: string } | null>(null);
  const [customTs, setCustomTs] = useState(""); // [temp] override punch time for testing
  const beeClicks = useRef(0);
  const beeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  async function handlePin(enteredPin: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: enteredPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "PIN 不正確");
        setPinKey((k) => k + 1);
        return;
      }
      setPin(enteredPin);
      setEmployee(data.employee);
      setSuggested(data.suggested_kind ?? "in");
      setCustomTs(nowTaipeiLocal()); // [temp] default to now when entering direction view
      setView("direction");
    } catch {
      setError("網路錯誤，請再試一次");
      setPinKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  function handleDirection(k: PunchKind) {
    if (!employee) return;
    // Show success immediately; fire punch in background
    setLastPunch({ employee, kind: k, server_ts: nowTaipei() });
    setView("success");
    setTimeout(() => {
      setView("pin");
      setPin("");
      setEmployee(null);
      setError(null);
      setLastPunch(null);
      setPinKey((k2) => k2 + 1);
    }, 2000);
    fetch("/api/punch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, client_ts: toClientTs(customTs), kind: k }), // [temp] uses customTs if set
    }).catch(() => {});
  }

  function handleCancel() {
    setView("pin");
    setPin("");
    setEmployee(null);
    setError(null);
    setPinKey((k) => k + 1);
  }

  function formatTime(iso: string) {
    return iso.slice(11, 16);
  }

  function handleBeeClick() {
    beeClicks.current += 1;
    if (beeTimer.current) clearTimeout(beeTimer.current);
    if (beeClicks.current >= 5) {
      beeClicks.current = 0;
      router.push("/admin");
    } else {
      beeTimer.current = setTimeout(() => { beeClicks.current = 0; }, 3000);
    }
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
          <>
            <div className="mb-6 flex justify-end">
              <Link href="/amend" className="text-sm text-stone-500 underline-offset-2 hover:underline">
                補登申請
              </Link>
            </div>
            <div className="flex items-center justify-center pt-4">
              <PinPad
                key={pinKey}
                onConfirm={handlePin}
                onCancel={null}
                loading={loading}
                error={error}
              />
            </div>
          </>
        )}

        {view === "direction" && employee && (
          <div className="flex flex-col items-center gap-8 pt-10">
            <p className="text-2xl font-bold text-gray-800">{employee}</p>
            {/* [temp] custom punch time for testing */}
            <div className="w-full max-w-sm">
              <label className="mb-1 block text-xs text-gray-400">打卡時間（測試用）</label>
              <input
                type="datetime-local"
                value={customTs}
                onChange={(e) => setCustomTs(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              />
            </div>
            <p className="text-sm text-gray-500">選擇打卡類型</p>
            <div className="flex w-full max-w-sm flex-col gap-4">
              <DirectionButton
                label="上班"
                emoji="🟢"
                suggested={suggested === "in"}
                onClick={() => handleDirection("in")}
              />
              <DirectionButton
                label="下班"
                emoji="🔴"
                suggested={suggested === "out"}
                onClick={() => handleDirection("out")}
              />
            </div>
            <button
              onClick={handleCancel}
              className="text-sm text-gray-400 underline-offset-2 hover:underline"
            >
              取消
            </button>
          </div>
        )}

        {view === "success" && lastPunch && (
          <div className="flex flex-col items-center justify-center gap-4 pt-16 text-center">
            <div className="text-6xl">✅</div>
            <p className="text-2xl font-bold text-gray-800">{lastPunch.employee}</p>
            <p className="text-gray-500">
              {lastPunch.kind === "in" ? "上班" : "下班"}打卡成功・{formatTime(lastPunch.server_ts)}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function DirectionButton({
  label,
  emoji,
  suggested,
  onClick,
}: {
  label: string;
  emoji: string;
  suggested: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-3 rounded-2xl py-6 text-2xl font-bold shadow-sm transition-all active:scale-95 ${
        suggested
          ? "bg-stone-800 text-white ring-4 ring-stone-300"
          : "bg-white text-gray-700"
      }`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      {suggested && <span className="text-xs font-normal opacity-70">（建議）</span>}
    </button>
  );
}
