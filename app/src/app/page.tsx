"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import EmployeeGrid from "@/components/EmployeeGrid";
import PinPad from "@/components/PinPad";
import type { Employee, PunchKind } from "@/types";

type View = "grid" | "direction" | "pin" | "success";

function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<PunchKind | null>(null);
  const [suggested, setSuggested] = useState<PunchKind | null>(null);
  const [view, setView] = useState<View>("grid");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [lastPunch, setLastPunch] = useState<{ employee: string; kind: PunchKind; server_ts: string } | null>(null);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data: Employee[]) => setEmployees(data))
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  async function handleSelect(name: string) {
    setSelected(name);
    setPinError(null);
    setSuggested(null);
    setView("direction");
    // Fetch last punch kind to suggest the opposite direction. Failure is non-fatal.
    try {
      const res = await fetch(`/api/punch/last?employee=${encodeURIComponent(name)}`);
      const data = await res.json();
      const last: PunchKind | null = data?.kind ?? null;
      setSuggested(last === "in" ? "out" : last === "out" ? "in" : "in");
    } catch {
      setSuggested("in");
    }
  }

  function handleDirection(k: PunchKind) {
    setKind(k);
    setView("pin");
  }

  async function handlePin(pin: string) {
    if (!selected || !kind) return;
    setPinLoading(true);
    setPinError(null);
    try {
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: selected, pin, client_ts: nowTaipei(), kind }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data.error ?? "打卡失敗");
        return;
      }
      setLastPunch({ employee: selected, kind, server_ts: data.server_ts });
      setView("success");
      setTimeout(() => {
        setView("grid");
        setSelected(null);
        setKind(null);
        setSuggested(null);
        setLastPunch(null);
      }, 2500);
    } catch {
      setPinError("網路錯誤，請再試一次");
    } finally {
      setPinLoading(false);
    }
  }

  function handleCancel() {
    setView("grid");
    setSelected(null);
    setKind(null);
    setSuggested(null);
    setPinError(null);
  }

  function handleBackToDirection() {
    setKind(null);
    setPinError(null);
    setView("direction");
  }

  function formatTime(iso: string) {
    return iso.slice(11, 16);
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      <div className="bg-stone-800 px-4 py-4 flex items-center gap-3">
        <span className="text-2xl">🐝</span>
        <h1 className="text-lg font-bold text-white">pokebee 打卡</h1>
      </div>

      <main className="mx-auto w-full max-w-lg px-4 py-6">
        {view === "grid" && (
          <>
            <div className="mb-4 flex justify-end">
              <Link href="/amend" className="text-sm text-stone-500 underline-offset-2 hover:underline">
                補登申請
              </Link>
            </div>
            <p className="mb-4 text-center text-sm text-gray-500">點選你的名字打卡</p>
            {loadingEmployees ? (
              <p className="text-center text-gray-400">載入中…</p>
            ) : employees.length === 0 ? (
              <p className="text-center text-gray-400">找不到員工資料</p>
            ) : (
              <EmployeeGrid employees={employees} onSelect={handleSelect} />
            )}
          </>
        )}

        {view === "direction" && selected && (
          <div className="flex flex-col items-center gap-8 pt-10">
            <p className="text-xl font-semibold text-gray-800">{selected}</p>
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

        {view === "pin" && selected && kind && (
          <div className="flex items-center justify-center pt-8">
            <PinPad
              employee={`${selected}・${kind === "in" ? "上班" : "下班"}`}
              onConfirm={handlePin}
              onCancel={handleBackToDirection}
              loading={pinLoading}
              error={pinError}
            />
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
