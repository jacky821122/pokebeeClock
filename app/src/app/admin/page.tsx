"use client";

import { useEffect, useState } from "react";

interface EmployeeAdmin {
  name: string;
  role: "full_time" | "hourly";
  active: boolean;
  has_pin: boolean;
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
    if (res.status === 401) {
      setAuthError("密鑰錯誤");
      return;
    }
    if (!res.ok) {
      setAuthError(`驗證失敗（${res.status}）`);
      return;
    }
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

  return <EmployeesTable secret={secret} onSignOut={() => {
    sessionStorage.removeItem(SECRET_KEY);
    setSecret(null);
  }} />;
}

function EmployeesTable({ secret, onSignOut }: { secret: string; onSignOut: () => void }) {
  const [employees, setEmployees] = useState<EmployeeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

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

  async function save(name: string, patch: { pin?: string; role?: string; active?: boolean }) {
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
    flash(`${name} 已儲存`, true);
    await load();
    return true;
  }

  async function create(payload: { name: string; pin: string; role: string }) {
    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      flash(data.error ?? "新增失敗", false);
      return false;
    }
    flash(`${payload.name} 已新增`, true);
    await load();
    return true;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">員工管理</h1>
        <button onClick={onSignOut} className="text-sm text-gray-500 hover:underline">
          登出
        </button>
      </div>

      {msg && (
        <div className={`mb-3 rounded px-3 py-2 text-sm ${msg.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">載入中…</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left">
              <th className="py-2 pr-3">名稱</th>
              <th className="py-2 pr-3">新 PIN（留空不變）</th>
              <th className="py-2 pr-3">身份</th>
              <th className="py-2 pr-3">啟用</th>
              <th className="py-2 pr-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <EmployeeRow key={e.name} employee={e} onSave={save} />
            ))}
            <NewEmployeeRow onCreate={create} />
          </tbody>
        </table>
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
  const [pin, setPin] = useState("");
  const [role, setRole] = useState(employee.role);
  const [active, setActive] = useState(employee.active);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const patch: { pin?: string; role?: string; active?: boolean } = {};
    if (pin) patch.pin = pin;
    if (role !== employee.role) patch.role = role;
    if (active !== employee.active) patch.active = active;
    if (Object.keys(patch).length === 0) {
      setSaving(false);
      return;
    }
    const ok = await onSave(employee.name, patch);
    if (ok) setPin("");
    setSaving(false);
  }

  return (
    <tr className="border-b border-stone-100">
      <td className="py-2 pr-3">
        <div>{employee.name}</div>
        <div className="text-xs text-gray-400">{employee.has_pin ? "PIN 已設定" : "尚未設定 PIN"}</div>
      </td>
      <td className="py-2 pr-3">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          placeholder="----"
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
          disabled={saving}
          className="rounded bg-stone-800 px-3 py-1 text-white disabled:opacity-50"
        >
          {saving ? "…" : "儲存"}
        </button>
      </td>
    </tr>
  );
}

function NewEmployeeRow({
  onCreate,
}: {
  onCreate: (payload: { name: string; pin: string; role: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<"full_time" | "hourly">("hourly");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() || pin.length !== 4) return;
    setSaving(true);
    const ok = await onCreate({ name: name.trim(), pin, role });
    if (ok) {
      setName("");
      setPin("");
      setRole("hourly");
    }
    setSaving(false);
  }

  return (
    <tr className="bg-stone-50">
      <td className="py-2 pr-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="員工姓名"
          className="w-full rounded border border-stone-300 px-2 py-1"
        />
      </td>
      <td className="py-2 pr-3">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          placeholder="----"
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
      <td className="py-2 pr-3">—</td>
      <td className="py-2 pr-3">
        <button
          onClick={submit}
          disabled={saving || !name.trim() || pin.length !== 4}
          className="rounded bg-green-700 px-3 py-1 text-white disabled:opacity-40"
        >
          {saving ? "…" : "新增"}
        </button>
      </td>
    </tr>
  );
}
