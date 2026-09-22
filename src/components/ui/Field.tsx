import { useEffect, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

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

// A plain <input type="number"> can't display an in-progress value like "-" or "-5" while
// the field is being typed into: the moment the value would be NaN (e.g. right after typing
// just "-"), the browser renders the input as empty, so the next keystroke starts fresh and
// the minus sign is lost. This manages its own text draft so a negative sign (or a trailing
// "." while typing a decimal) survives until the field is complete, and only calls onChange
// once the draft parses to a real number.
const NUMERIC_DRAFT_PATTERN = /^-?\d*\.?\d*$/;

export function NumberInput({
  value,
  onChange,
  onFocus,
  onBlur,
  ...rest
}: {
  value: number;
  onChange: (value: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText((prev) => (prev !== "" && prev !== "-" && Number(prev) === value ? prev : String(value)));
  }, [value]);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        e.target.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setText(String(value));
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== "" && raw !== "-" && !NUMERIC_DRAFT_PATTERN.test(raw)) return;
        setText(raw);
        if (raw === "" || raw === "-") return;
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
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
