"use client";

import { useState } from "react";

interface Props {
  employee: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
const PIN_LENGTH = 4;

export default function PinPad({ employee, onConfirm, onCancel, loading, error }: Props) {
  const [pin, setPin] = useState("");

  function press(key: string) {
    if (loading) return;
    if (key === "⌫") {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < PIN_LENGTH) {
      const next = pin + key;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        onConfirm(next);
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-lg font-semibold text-gray-800">{employee}</p>
        <p className="text-sm text-gray-500">請輸入 PIN</p>
      </div>

      {/* dots */}
      <div className="flex gap-3">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < pin.length ? "border-stone-700 bg-stone-700" : "border-stone-300"
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm font-medium text-red-500">{error}</p>}

      {/* keypad */}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            disabled={key === "" || loading}
            onClick={() => key && press(key)}
            className={`flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-semibold transition-all ${
              key === ""
                ? "invisible"
                : "bg-white shadow-sm active:scale-95 active:bg-stone-100 disabled:opacity-50"
            }`}
          >
            {loading && key !== "⌫" ? (key === "⌫" ? "⌫" : key) : key}
          </button>
        ))}
      </div>

      <button
        onClick={onCancel}
        disabled={loading}
        className="text-sm text-gray-400 underline-offset-2 hover:underline"
      >
        取消
      </button>
    </div>
  );
}
