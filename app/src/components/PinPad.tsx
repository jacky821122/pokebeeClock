"use client";

import { useState } from "react";

interface Props {
  employee?: string;
  onConfirm: (pin: string) => void;
  onCancel: (() => void) | null;
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
    <div className="glass-panel flex flex-col items-center gap-6 rounded-[1.75rem] px-6 py-7 lg:gap-8 lg:px-10 lg:py-10">
      <div className="text-center">
        {employee ? (
          <p className="text-lg font-semibold text-brand lg:text-2xl">{employee}</p>
        ) : null}
        <p className="text-sm text-brand-soft/70 lg:text-base">請輸入 PIN</p>
      </div>

      {/* dots */}
      <div className="flex gap-3 lg:gap-4">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors lg:h-5 lg:w-5 ${
              i < pin.length ? "border-brand bg-brand" : "border-brand-soft/30"
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm font-medium text-red-500 lg:text-base">{error}</p>}

      {/* keypad */}
      <div className="grid grid-cols-3 gap-3 lg:gap-5">
        {KEYS.map((key, idx) => (
          <button
            key={idx}
            disabled={key === "" || loading}
            onClick={() => key && press(key)}
            className={`flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-semibold text-brand transition-all lg:h-24 lg:w-24 lg:text-3xl ${
              key === ""
                ? "invisible"
                : "border border-brand-honey/20 bg-white/95 shadow-sm hover:-translate-y-0.5 hover:bg-brand-sand active:scale-95 disabled:opacity-50"
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          disabled={loading}
          className="text-sm text-brand-soft/60 underline-offset-2 hover:underline"
        >
          取消
        </button>
      )}
    </div>
  );
}
