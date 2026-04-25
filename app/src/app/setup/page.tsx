"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setDevice } from "@/lib/device_client";

function SetupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(() => params.get("code") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!code.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/device/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "驗證失敗"); return; }
      setDevice(code.trim(), data.label ?? "");
      router.push("/");
    } catch {
      setError("網路錯誤，請再試一次");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      <div className="bg-stone-800 px-4 py-4">
        <h1 className="text-lg font-bold text-white">pokebee 裝置設定</h1>
      </div>
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <div className="space-y-5">
          <div>
            <p className="text-sm text-gray-600">
              此裝置尚未授權。請輸入管理者提供的 setup code 完成設定。
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Setup code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-base text-gray-700"
              placeholder="貼上或輸入 setup code"
            />
          </div>
          {error && <p className="text-sm font-medium text-red-500">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading || !code.trim()}
            className="w-full rounded-2xl bg-stone-800 py-4 text-lg font-bold text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? "驗證中…" : "完成設定"}
          </button>
          <p className="text-xs text-gray-400">
            設定後 token 會儲存在此瀏覽器，不需重複輸入。失效時會自動回到此頁。
          </p>
        </div>
      </main>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupInner />
    </Suspense>
  );
}
