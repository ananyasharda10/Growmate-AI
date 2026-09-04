import type { ReactNode } from "react";

type Tone = "red" | "green" | "amber" | "gray";

const toneClasses: Record<Tone, string> = {
  red: "bg-red-500 text-white",
  green: "bg-brand-100 text-brand-700",
  amber: "bg-amber-100 text-amber-800",
  gray: "bg-gray-100 text-gray-600",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
