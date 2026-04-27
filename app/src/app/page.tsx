"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import PinPad from "@/components/PinPad";
import { apiFetch } from "@/lib/device_client";
import type { PunchKind } from "@/types";

type View = "pin" | "punch" | "supplement" | "overtime" | "success";

interface MissingPunch {
  date: string;
  shift: string;
  missing: "in" | "out";
  existing_time: string;
}

interface OtRecord {
  submitted_at: string;
  date: string;
  start_time: string;
  end_time: string;
  minutes: number;
  reason: string;
}

/** Default supplement time based on shift + missing type */
function defaultSupTime(shift: string, missing: "in" | "out"): string {
  if (shift === "早班") return missing === "in" ? "10:00" : "14:00";
  return missing === "in" ? "16:00" : "20:00";
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

function greetingTaipei(): string {
  const hour = Number(nowTaipei().slice(11, 13));
  if (hour < 12) return "早安";
  if (hour < 15) return "午安";
  return "晚安";
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
  const [supTime, setSupTime] = useState("10:00");
  const [supContext, setSupContext] = useState<MissingPunch | null>(null);
  const [otDate, setOtDate] = useState("");
  const [otStart, setOtStart] = useState("18:00");
  const [otEnd, setOtEnd] = useState("19:00");
  const [otReason, setOtReason] = useState("");
  const [otRecords, setOtRecords] = useState<OtRecord[]>([]);
  const [otLoading, setOtLoading] = useState(false);

  const [bossMessage, setBossMessage] = useState<string | null>(null);
  const [bossResponded, setBossResponded] = useState<string | null>(null);
  const [showBossArea, setShowBossArea] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);
  const [countdownKey, setCountdownKey] = useState(0);

  const beeClicks = useRef(0);
  const beeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchPromise = useRef<Promise<string | null> | null>(null);
  const router = useRouter();

  function resetToPin() {
    if (successTimer.current) { clearTimeout(successTimer.current); successTimer.current = null; }
    setView("pin"); setPin(""); setEmployee(null); setError(null);
    setMissingPunches([]); setPinKey((k) => k + 1); setSupContext(null);
    setBossMessage(null); setBossResponded(null); setShowBossArea(false);
    setCountdownMs(0);
    prefetchPromise.current = null;
  }

  function prefetchBossMessage() {
    prefetchPromise.current = (async () => {
      try {
        const res = await apiFetch("/api/message");
        if (!res.ok) return null;
        const data = await res.json();
        return (data.text as string | null) ?? null;
      } catch { return null; }
    })();
  }

  async function awaitBossText(): Promise<string | null> {
    const pending = prefetchPromise.current;
    if (!pending) return null;
    // Cap the wait so a slow Sheets call can't block the success view forever.
    return Promise.race<string | null>([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
  }

  async function handlePin(enteredPin: string) {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/identify", {
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
      prefetchBossMessage();
    } catch { setError("網路錯誤，請再試一次"); setPinKey((k) => k + 1); }
    finally { setLoading(false); }
  }

  function showSuccess(msg: string, opts: { bossText?: string | null } = {}) {
    const msgToShow = opts.bossText ?? null;
    setSuccessMsg(msg);
    setBossMessage(msgToShow);
    setBossResponded(null);
    setShowBossArea(!!msgToShow);
    setView("success");
    if (successTimer.current) clearTimeout(successTimer.current);
    if (msgToShow) {
      setCountdownMs(5000);
      setCountdownKey((k) => k + 1);
      successTimer.current = setTimeout(resetToPin, 5000);
    } else {
      setCountdownMs(0);
      successTimer.current = setTimeout(resetToPin, 2500);
    }
  }

  function respondToBoss(emoji: string) {
    if (!employee || !bossMessage || bossResponded) return;
    setBossResponded(emoji);
    apiFetch("/api/message", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee, message_text: bossMessage, response: emoji }),
    }).catch(() => {});
    // Quick exit on response — long enough that the picked emoji is visibly confirmed.
    if (successTimer.current) clearTimeout(successTimer.current);
    setCountdownMs(0);
    successTimer.current = setTimeout(resetToPin, 1200);
  }

  /** Brief success flash, then return to punch view (stay logged in) */
  function showSuccessAndReturn(msg: string) {
    setSuccessMsg(msg); setView("success");
    setTimeout(() => { setView("punch"); setError(null); }, 1500);
  }

  async function handlePunch(k: PunchKind) {
    if (!employee) return;
    apiFetch("/api/punch", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, client_ts: toClientTs(customTs), kind: k }),
    }).catch(() => {});
    const bossText = await awaitBossText();
    showSuccess(`${employee}・${k === "in" ? "上班" : "下班"}打卡成功`, { bossText });
  }

  function handleSupplement() {
    if (!employee || !supDate || !supTime) return;
    const client_ts = `${supDate}T${supTime}:00+08:00`;
    // Optimistic update: remove the matching missing punch from state
    setMissingPunches((prev) => prev.filter(
      (mp) => !(mp.date === supDate && mp.missing === supKind)
    ));
    showSuccessAndReturn(`${employee}・${supDate} ${supTime} 補登${supKind === "in" ? "上班" : "下班"}`);
    apiFetch("/api/punch", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, client_ts, kind: supKind, source: "supplement" }),
    }).catch(() => {});
  }

  function handleOvertime() {
    if (!employee || !otDate || !otStart || !otEnd) return;
    const diff = hmToMin(otEnd) - hmToMin(otStart);
    const minutes = diff > 0 ? Math.floor(diff / 15) * 15 : 0;
    if (minutes <= 0) { setError("加班時數不足 15 分鐘"); return; }
    showSuccessAndReturn(`${employee}・${otDate} 加班 ${minutes} 分鐘 申請成功`);
    apiFetch("/api/overtime", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, date: otDate, start_time: otStart, end_time: otEnd, reason: otReason.trim() || undefined }),
    }).catch(() => {});
  }

  async function loadOtRecords() {
    if (!pin) return;
    setOtLoading(true);
    try {
      const res = await apiFetch(`/api/overtime?pin=${encodeURIComponent(pin)}`);
      const data = await res.json();
      if (res.ok) setOtRecords(data.records ?? []);
    } catch { /* ignore */ }
    finally { setOtLoading(false); }
  }

  async function revokeOt(submittedAt: string) {
    if (!pin) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/overtime", { method: "DELETE", headers: { "Content-Type": "application/json" },
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

  function prefillFromMissing(mp: MissingPunch) {
    setSupDate(mp.date); setSupKind(mp.missing);
    setSupTime(defaultSupTime(mp.shift, mp.missing));
    setSupContext(mp);
    setView("supplement");
  }

  function handleBeeClick() {
    beeClicks.current += 1;
    if (beeTimer.current) clearTimeout(beeTimer.current);
    if (beeClicks.current >= 5) { beeClicks.current = 0; router.push("/admin"); }
    else { beeTimer.current = setTimeout(() => { beeClicks.current = 0; }, 3000); }
  }

  return (
    <div className="app-bg min-h-dvh">
      <div className="bg-brand/95 px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={handleBeeClick} aria-label="logo" className="text-2xl select-none focus:outline-none">🐝</button>
        <h1 className="text-lg font-bold text-brand-cream tracking-wide">pokebee 打卡</h1>
        <span className="ml-auto text-xs text-brand-cream/40">{process.env.NEXT_PUBLIC_BUILD_SHA}</span>
      </div>

      <main className="mx-auto w-full max-w-lg px-4 py-6 lg:max-w-2xl lg:py-10">
        {view === "pin" && (
          <div className="flex items-center justify-center pt-4">
            <PinPad key={pinKey} onConfirm={handlePin} onCancel={null} loading={loading} error={error} />
          </div>
        )}

        {view === "punch" && employee && (
          <div className="glass-panel flex flex-col items-center gap-6 rounded-[1.75rem] px-4 pb-8 pt-6 lg:gap-8 lg:px-8 lg:pt-8">
            <p className="rounded-full bg-brand-honey/30 px-3 py-1 text-sm font-medium text-brand-soft lg:text-base">{greetingTaipei()}，今天也辛苦了 ✨</p>
            <p className="-mt-3 text-2xl font-bold text-brand lg:text-4xl">{employee}</p>

            {missingPunches.length > 0 && (
              <div className="w-full max-w-sm rounded-2xl border border-amber-300/80 bg-amber-50/95 p-4 shadow-sm lg:max-w-md lg:p-5">
                <p className="mb-2 text-sm font-semibold text-amber-800 lg:text-base">⚠️ 缺卡紀錄</p>
                {missingPunches.map((mp, i) => (
                  <button key={i} onClick={() => prefillFromMissing(mp)}
                    className="mb-1 block w-full rounded-xl bg-amber-100/90 px-3 py-2 text-left text-sm text-amber-900 transition-all active:bg-amber-200 lg:px-4 lg:py-3 lg:text-base">
                    {mp.date} {mp.shift} — 缺{mp.missing === "in" ? "上班" : "下班"}打卡
                    {mp.existing_time && (
                      <span className="ml-1 text-xs text-amber-700 lg:text-sm">（已有{mp.missing === "out" ? "上班" : "下班"} {mp.existing_time}）</span>
                    )}
                    <span className="ml-2 text-xs text-amber-600 lg:text-sm">點擊補登 →</span>
                  </button>
                ))}
              </div>
            )}

            {process.env.NODE_ENV === "development" && (
              <div className="w-full max-w-sm lg:max-w-md">
                <label className="mb-1 block text-xs text-gray-400 lg:text-sm">打卡時間（測試用）</label>
                <input type="datetime-local" value={customTs} onChange={(e) => setCustomTs(e.target.value)}
                  className="input-soft w-full lg:px-4 lg:py-3 lg:text-base" />
              </div>
            )}
            <p className="text-sm font-medium text-brand-soft/70 lg:text-lg">選擇打卡類型</p>
            <div className="flex w-full max-w-sm flex-col gap-4 lg:max-w-md lg:gap-5">
              <DirectionButton label="上班" emoji="🟢" suggested={suggested === "in"} onClick={() => handlePunch("in")} />
              <DirectionButton label="下班" emoji="🔴" suggested={suggested === "out"} onClick={() => handlePunch("out")} />
            </div>

            <div className="flex w-full max-w-sm gap-3 pt-2 lg:max-w-md lg:gap-4">
              <button onClick={() => { setSupContext(null); setSupDate(todayTaipei()); setSupKind("in"); setSupTime("10:00"); setView("supplement"); }}
                className="flex-1 rounded-2xl border border-brand-honey/20 bg-white/90 px-3 py-3 text-sm font-medium text-brand-soft shadow-sm transition-all active:scale-[0.98] active:bg-brand-sand lg:py-4 lg:text-base">
                📝 補登打卡
              </button>
              <button onClick={goToOvertime}
                className="flex-1 rounded-2xl border border-brand-honey/20 bg-white/90 px-3 py-3 text-sm font-medium text-brand-soft shadow-sm transition-all active:scale-[0.98] active:bg-brand-sand lg:py-4 lg:text-base">
                🕐 加班申請
              </button>
            </div>

            <button onClick={resetToPin} className="text-sm text-brand-soft/60 underline-offset-2 lg:text-base">取消</button>
          </div>
        )}

        {view === "supplement" && employee && (
          <div className="glass-panel flex flex-col items-center gap-6 rounded-[1.75rem] px-4 pb-8 pt-8">
            <p className="text-2xl font-bold text-brand">{employee}・補登打卡</p>
            {error && <p className="text-sm font-medium text-red-500">{error}</p>}

            {supContext && supContext.existing_time && (
              <div className="w-full max-w-sm rounded-2xl border border-blue-200 bg-blue-50 p-4">
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
                <input type="date" value={supDate} onChange={(e) => setSupDate(e.target.value)}
                  className="input-soft w-full" />
              </Field>
              <Field label="類型">
                <div className="flex gap-3">
                  <ToggleBtn active={supKind === "in"} onClick={() => setSupKind("in")}>上班</ToggleBtn>
                  <ToggleBtn active={supKind === "out"} onClick={() => setSupKind("out")}>下班</ToggleBtn>
                </div>
              </Field>
              <Field label="時間">
                <input type="time" value={supTime} onChange={(e) => setSupTime(e.target.value)}
                  className="input-soft w-full" />
              </Field>
              <button onClick={handleSupplement} disabled={loading}
                className="w-full rounded-2xl bg-brand py-4 text-lg font-bold text-brand-cream shadow-md transition-all active:scale-95 disabled:opacity-50">
                {loading ? "送出中…" : "送出補登"}
              </button>
            </div>
            <button onClick={() => { setError(null); setSupContext(null); setView("punch"); }} className="text-sm text-brand-soft/60 underline-offset-2">返回</button>
          </div>
        )}

        {view === "overtime" && employee && (
          <div className="glass-panel flex flex-col items-center gap-6 rounded-[1.75rem] px-4 pb-8 pt-8">
            <p className="text-2xl font-bold text-brand">{employee}・加班申請</p>
            {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            <div className="w-full max-w-sm space-y-4">
              <Field label="日期">
                <input type="date" value={otDate} onChange={(e) => setOtDate(e.target.value)}
                  className="input-soft w-full" />
              </Field>
              <Field label="開始時間">
                <input type="time" value={otStart} onChange={(e) => setOtStart(e.target.value)}
                  className="input-soft w-full" />
              </Field>
              <Field label="結束時間">
                <input type="time" value={otEnd} onChange={(e) => setOtEnd(e.target.value)}
                  className="input-soft w-full" />
              </Field>
              <Field label="原因（選填）">
                <input type="text" value={otReason} onChange={(e) => setOtReason(e.target.value)}
                  placeholder="例：活動準備、盤點…"
                  className="input-soft w-full" />
              </Field>
              {otStart && otEnd && (() => {
                const diff = hmToMin(otEnd) - hmToMin(otStart);
                const rounded = diff > 0 ? Math.floor(diff / 15) * 15 : 0;
                return rounded > 0 ? (
                  <p className="text-center text-sm text-gray-500">
                    加班時數：<span className="font-semibold text-gray-800">{rounded} 分鐘</span>（{(rounded / 60).toFixed(2)} 小時）
                  </p>
                ) : null;
              })()}
              <button onClick={handleOvertime} disabled={loading}
                className="w-full rounded-2xl bg-brand py-4 text-lg font-bold text-brand-cream shadow-md transition-all active:scale-95 disabled:opacity-50">
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
                      <div key={r.submitted_at} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_2px_12px_rgba(90,58,40,0.06)]">
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">{r.date}</span>{" "}
                          <span className="text-gray-500">{r.start_time}-{r.end_time}</span>{" "}
                          <span className="text-xs text-gray-400">({r.minutes}分)</span>
                          {r.reason && <span className="ml-1 text-xs text-gray-400">| {r.reason}</span>}
                        </div>
                        {canRevoke ? (
                          <button onClick={() => revokeOt(r.submitted_at)} disabled={loading}
                            className="ml-2 shrink-0 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors active:bg-red-100 disabled:opacity-40">
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

            <button onClick={() => { setError(null); setView("punch"); }} className="text-sm text-brand-soft/60 underline-offset-2">返回</button>
          </div>
        )}

        {view === "success" && (
          <div className="glass-panel mx-auto flex max-w-sm flex-col items-center justify-center gap-4 rounded-[1.75rem] px-6 py-10 text-center">
            <Image src="/icon-512.png" alt="" width={120} height={120} className="rounded-3xl shadow-md ring-4 ring-brand-honey/25" />
            <div className="text-5xl">✅</div>
            <p className="text-xl font-bold text-brand">{successMsg}</p>

            {showBossArea && bossMessage && (
              <BossMessageCard text={bossMessage} responded={bossResponded} onRespond={respondToBoss} />
            )}

            {countdownMs > 0 && (
              <div className="countdown-track mt-2 w-full" aria-hidden="true">
                <div key={countdownKey} className="countdown-fill" style={{ animationDuration: `${countdownMs}ms` }} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const BOSS_RESPONSES: { emoji: string; label: string }[] = [
  { emoji: "❤️", label: "收到" },
  { emoji: "🙏", label: "謝謝" },
  { emoji: "🤔", label: "嗯…" },
];

function BossMessageCard({ text, responded, onRespond }: { text: string; responded: string | null; onRespond: (emoji: string) => void }) {
  return (
    <div className="mt-3 w-full rounded-2xl border border-brand-honey/40 bg-brand-honey/15 px-4 py-3 text-left">
      <p className="text-sm text-brand">{text}</p>
      <div className="mt-2 flex justify-end gap-2">
        {BOSS_RESPONSES.map(({ emoji, label }) => {
          const picked = responded === emoji;
          const otherPicked = responded !== null && !picked;
          return (
            <button
              key={emoji}
              onClick={() => onRespond(emoji)}
              disabled={responded !== null}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-all active:scale-90 ${
                picked
                  ? "bg-brand text-brand-cream ring-2 ring-brand-honey"
                  : otherPicked
                    ? "bg-white/40 opacity-40"
                    : "bg-white/90 shadow-sm"
              }`}
            >
              {`${emoji} ${label}`}
            </button>
          );
        })}
      </div>
      {responded && <p className="mt-1 text-right text-xs text-brand-soft/60">已收到回應</p>}
    </div>
  );
}

function DirectionButton({ label, emoji, suggested, onClick }: { label: string; emoji: string; suggested: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-3 rounded-3xl py-6 text-2xl font-bold shadow-md transition-all active:scale-95 lg:gap-5 lg:py-10 lg:text-4xl ${
        suggested
          ? "bg-brand text-brand-cream ring-4 ring-brand-accent/40"
          : "border border-brand-honey/20 bg-white/95 text-brand-soft"
      }`}>
      <span>{emoji}</span><span>{label}</span>
      {suggested && <span className="rounded-full bg-brand-honey/20 px-2 py-0.5 text-xs font-normal opacity-90 lg:text-sm">建議</span>}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label className="mb-1 block text-sm font-medium text-gray-600">{label}</label>{children}</div>);
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all active:scale-95 ${
        active ? "bg-brand text-brand-cream shadow-sm" : "bg-brand-sand/85 text-brand-soft/70 active:bg-brand-sand"
      }`}>
      {children}
    </button>
  );
}
