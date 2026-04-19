import Link from "next/link";
import AmendForm from "@/components/AmendForm";
import { getActiveEmployeesSortedByLastPunch } from "@/lib/sheets";

export default async function AmendPage() {
  let employees: string[] = [];
  try {
    employees = await getActiveEmployeesSortedByLastPunch();
  } catch {
    // render with empty list; form will still show
  }

  return (
    <div className="min-h-dvh bg-stone-50">
      <div className="bg-stone-800 px-4 py-4 flex items-center gap-3">
        <Link href="/" className="text-stone-400 hover:text-white text-sm">← 返回</Link>
        <h1 className="text-lg font-bold text-white">補登申請</h1>
      </div>
      <main className="mx-auto w-full max-w-lg px-4 py-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <AmendForm employees={employees} />
        </div>
      </main>
    </div>
  );
}
