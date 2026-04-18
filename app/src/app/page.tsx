"use client";

import { useEffect, useState } from "react";
import EmployeeGrid from "@/components/EmployeeGrid";
import PinPad from "@/components/PinPad";
import type { Employee } from "@/types";

type View = "grid" | "pin" | "success";

function nowTaipei(): string {
  const now = new Date();
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().replace("Z", "+08:00");
}

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("grid");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [lastPunch, setLastPunch] = useState<{ employee: string; server_ts: string } | null>(null);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data: Employee[]) => setEmployees(data))
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  function handleSelect(name: string) {
    setSelected(name);
    setPinError(null);
    setView("pin");
  }

  async function handlePin(pin: string) {
    if (!selected) return;
    setPinLoading(true);
    setPinError(null);
    try {
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee: selected, pin, client_ts: nowTaipei() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data.error ?? "打卡失敗");
        return;
      }
      setLastPunch({ employee: selected, server_ts: data.server_ts });
      setView("success");
      setTimeout(() => {
        setView("grid");
        setSelected(null);
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
    setPinError(null);
  }

  // Format server_ts for display: "HH:MM"
  function formatTime(iso: string) {
    return iso.slice(11, 16);
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      {/* Header */}
      <div className="bg-stone-800 px-4 py-4 flex items-center gap-3">
        <span className="text-2xl">🐝</span>
        <h1 className="text-lg font-bold text-white">pokebee 打卡</h1>
      </div>

      <main className="mx-auto w-full max-w-lg px-4 py-6">
        {view === "grid" && (
          <>
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

        {view === "pin" && selected && (
          <div className="flex items-center justify-center pt-8">
            <PinPad
              employee={selected}
              onConfirm={handlePin}
              onCancel={handleCancel}
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
              打卡成功・{formatTime(lastPunch.server_ts)}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
