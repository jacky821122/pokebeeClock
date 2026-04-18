"use client";

import type { Employee } from "@/types";

interface Props {
  employees: Employee[];
  onSelect: (name: string) => void;
}

export default function EmployeeGrid({ employees, onSelect }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {employees.map((emp) => (
        <button
          key={emp.name}
          onClick={() => onSelect(emp.name)}
          className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-sm active:scale-95 active:bg-stone-100 transition-transform"
        >
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-stone-200 text-xl font-bold text-stone-600">
            {emp.name[0]}
          </div>
          <span className="text-sm font-medium text-gray-800 text-center leading-tight">
            {emp.name}
          </span>
        </button>
      ))}
    </div>
  );
}
