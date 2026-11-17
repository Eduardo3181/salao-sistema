"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";

/** Escolher o dia pelo calendário do próprio aparelho. */
export default function SeletorData({ data, extra }: { data: string; extra: string }) {
  const router = useRouter();
  return (
    <label className="relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-300 hover:bg-white">
      <CalendarDays aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      <span className="sr-only">Escolher dia</span>
      <input
        type="date"
        value={data}
        onChange={(e) => e.target.value && router.push(`/agenda?data=${e.target.value}${extra}`)}
        className="w-[8.5rem] bg-transparent outline-none"
      />
    </label>
  );
}
