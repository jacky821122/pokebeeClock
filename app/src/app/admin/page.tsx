"use client";

import { useEffect, useState } from "react";

interface EmployeeAdmin {
  name: string;
  pin: string;
  role: "full_time" | "hourly";
  active: boolean;
}

interface DraftRow {
  id: number;
  selected: boolean;
  name: string;
  pin: string;
  role: "full_time" | "hourly";
}

const SECRET_KEY = "pokebee_admin_secret";

export default function AdminPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem(SECRET_KEY);
    if (cached) setSecret(cached);
  }, []);

  async function tryAuth(s: string) {
    setAuthError(null);
    const res = await fetch("/api/admin/employees", {
      headers: { Authorization: `Bearer ${s}` },
    });
    if (res.status === 401) return setAuthError("密鑰錯誤");
    if (!res.ok) return setAuthError(`驗證失敗（${res.status}）`);
    sessionStorage.setItem(SECRET_KEY, s);
    setSecret(s);
  }

  if (!secret) {
    return (
      <div className="mx-auto w-full max-w-sm px-4 py-20">
        <h1 className="mb-6 text-xl font-bold">管理者登入</h1>
        <input
          type="password"
          value={secretInput}
          onChange={(e) => setSecretInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && tryAuth(secretInput)}
          placeholder="ADMIN_SECRET"
          className="mb-3 w-full rounded border border-stone-300 px-3 py-2"
        />
        {authError && <p className="mb-3 text-sm text-red-500">{authError}</p>}
        <button
          onClick={() => tryAuth(secretInput)}
          className="w-full rounded bg-stone-800 py-2 text-white"
        >
          進入
        </button>
      </div>
    );
  }

  return (
    <AdminDashboard
      secret={secret}
      onSignOut={() => {
        sessionStorage.removeItem(SECRET_KEY);
        setSecret(null);
      }}
    />
  );
}

function AdminDashboard({ secret, onSignOut }: { secret: string; onSignOut: () => void }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">管理後台</h1>
        <button onClick={onSignOut} className="text-sm text-gray-500 hover:underline">
          登出
        </button>
      </div>
      <ReportDownload secret={secret} />
      <EmployeesTable secret={secret} />
    </div>
  );
}

function ReportDownload({ secret }: { secret: string }) {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/report?month=${month}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `失敗（${res.status}）`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clock_report_${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("網路錯誤");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">下載報表</h2>
      <div className="flex items-center gap-3">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded border border-stone-300 px-3 py-2"
        />
        <button
          onClick={download}
          disabled={loading}
          className="rounded bg-stone-800 px-4 py-2 text-white disabled:opacity-40"
        >
          {loading ? "產生中…" : "下載 xlsx"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}

function EmployeesTable({ secret }: { secret: string }) {
  const [employees, setEmployees] = useState<EmployeeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/employees", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setEmployees(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  }

  async function patchEmployee(name: string, patch: { pin?: string; role?: string; active?: boolean }) {
    const res = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ name, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      flash(data.error ?? "儲存失敗", false);
      return false;
    }
    flash(`${name} 已更新`, true);
    await load();
    return true;
  }

  function addDraft() {
    setDrafts((d) => [...d, { id: Date.now() + Math.random(), selected: true, name: "", pin: "", role: "hourly" }]);
  }

  function updateDraft(id: number, patch: Partial<DraftRow>) {
    setDrafts((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeDraft(id: number) {
    setDrafts((d) => d.filter((r) => r.id !== id));
  }

  async function submitSelectedDrafts() {
    const selected = drafts.filter((d) => d.selected);
    const invalid = selected.filter((d) => !d.name.trim() || !/^\d{4}$/.test(d.pin));
    if (invalid.length > 0) {
      flash(`有 ${invalid.length} 列資料不完整（姓名或 4 位 PIN）`, false);
      return;
    }
    if (selected.length === 0) {
      flash("未選取任何列", false);
      return;
    }

    let ok = 0;
    const errors: string[] = [];
    for (const d of selected) {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ name: d.name.trim(), pin: d.pin, role: d.role }),
      });
      const data = await res.json();
      if (res.ok) ok++;
      else errors.push(`${d.name}：${data.error ?? res.status}`);
    }
    flash(`新增 ${ok}/${selected.length} 成功${errors.length ? "；失敗：" + errors.join("，") : ""}`, errors.length === 0);
    // Remove successful drafts (they're now in employees list)
    const successNames = new Set(selected.slice(0, ok).map((d) => d.name.trim()));
    setDrafts((d) => d.filter((r) => !successNames.has(r.name.trim())));
    await load();
  }

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">員工管理</h2>

      {msg && (
        <div
          className={`mb-3 rounded px-3 py-2 text-sm ${
            msg.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">載入中…</p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left">
                <th className="py-2 pr-3">名稱</th>
                <th className="py-2 pr-3">PIN</th>
                <th className="py-2 pr-3">身份</th>
                <th className="py-2 pr-3">啟用</th>
                <th className="py-2 pr-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <EmployeeRow key={e.name} employee={e} onSave={patchEmployee} />
              ))}
            </tbody>
          </table>

          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">新增員工</h2>
              <div className="flex gap-2">
                <button
                  onClick={addDraft}
                  className="rounded border border-stone-400 px-3 py-1 text-sm"
                >
                  + 新增一列
                </button>
                <button
                  onClick={submitSelectedDrafts}
                  disabled={drafts.filter((d) => d.selected).length === 0}
                  className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-40"
                >
                  批次新增選取列（{drafts.filter((d) => d.selected).length}）
                </button>
              </div>
            </div>

            {drafts.length === 0 ? (
              <p className="py-4 text-sm text-gray-400">尚無新增列。點「+ 新增一列」開始。</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-300 text-left">
                    <th className="py-2 pr-3 w-10">選取</th>
                    <th className="py-2 pr-3">名稱</th>
                    <th className="py-2 pr-3">PIN</th>
                    <th className="py-2 pr-3">身份</th>
                    <th className="py-2 pr-3">移除</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => (
                    <DraftRowView key={d.id} draft={d} onChange={updateDraft} onRemove={removeDraft} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmployeeRow({
  employee,
  onSave,
}: {
  employee: EmployeeAdmin;
  onSave: (name: string, patch: { pin?: string; role?: string; active?: boolean }) => Promise<boolean>;
}) {
  const [pin, setPin] = useState(employee.pin);
  const [role, setRole] = useState(employee.role);
  const [active, setActive] = useState(employee.active);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPin(employee.pin);
    setRole(employee.role);
    setActive(employee.active);
  }, [employee.pin, employee.role, employee.active]);

  const dirty = pin !== employee.pin || role !== employee.role || active !== employee.active;
  const validPin = /^\d{4}$/.test(pin);
  const canSave = dirty && validPin && !saving;

  async function submit() {
    if (!canSave) return;
    setSaving(true);
    const patch: { pin?: string; role?: string; active?: boolean } = {};
    if (pin !== employee.pin) patch.pin = pin;
    if (role !== employee.role) patch.role = role;
    if (active !== employee.active) patch.active = active;
    await onSave(employee.name, patch);
    setSaving(false);
  }

  return (
    <tr className="border-b border-stone-100">
      <td className="py-2 pr-3">{employee.name}</td>
      <td className="py-2 pr-3">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          className="w-20 rounded border border-stone-300 px-2 py-1 tracking-widest"
        />
      </td>
      <td className="py-2 pr-3">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "full_time" | "hourly")}
          className="rounded border border-stone-300 px-2 py-1"
        >
          <option value="full_time">正職</option>
          <option value="hourly">計時</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="py-2 pr-3">
        <button
          onClick={submit}
          disabled={!canSave}
          className="rounded bg-stone-800 px-3 py-1 text-white disabled:opacity-30"
        >
          {saving ? "…" : "儲存"}
        </button>
      </td>
    </tr>
  );
}

function DraftRowView({
  draft,
  onChange,
  onRemove,
}: {
  draft: DraftRow;
  onChange: (id: number, patch: Partial<DraftRow>) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <tr className="border-b border-stone-100 bg-stone-50">
      <td className="py-2 pr-3">
        <input
          type="checkbox"
          checked={draft.selected}
          onChange={(e) => onChange(draft.id, { selected: e.target.checked })}
        />
      </td>
      <td className="py-2 pr-3">
        <input
          value={draft.name}
          onChange={(e) => onChange(draft.id, { name: e.target.value })}
          placeholder="員工姓名"
          className="w-full rounded border border-stone-300 px-2 py-1"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          value={draft.pin}
          onChange={(e) => onChange(draft.id, { pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          inputMode="numeric"
          maxLength={4}
          placeholder="----"
          className="w-20 rounded border border-stone-300 px-2 py-1 tracking-widest"
        />
      </td>
      <td className="py-2 pr-3">
        <select
          value={draft.role}
          onChange={(e) => onChange(draft.id, { role: e.target.value as "full_time" | "hourly" })}
          className="rounded border border-stone-300 px-2 py-1"
        >
          <option value="full_time">正職</option>
          <option value="hourly">計時</option>
        </select>
      </td>
      <td className="py-2 pr-3">
        <button
          onClick={() => onRemove(draft.id)}
          className="text-sm text-red-600 hover:underline"
        >
          移除
        </button>
      </td>
    </tr>
  );
}
