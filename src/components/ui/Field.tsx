import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const baseInput =
  "w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 placeholder:text-gray-400";

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-gray-700">{children}</label>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { onFocus, ...rest } = props;
  return (
    <input
      {...rest}
      onFocus={(e) => {
        // Number fields default to 0 — select it on focus so typing replaces
        // it immediately instead of appending to it (e.g. "0" + "5" -> "05").
        if (props.type === "number") e.target.select();
        onFocus?.(e);
      }}
      className={`${baseInput} ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseInput} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${baseInput} ${props.className ?? ""}`} />;
}

export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
