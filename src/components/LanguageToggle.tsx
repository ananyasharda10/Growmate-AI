import { useT } from "../lib/i18n/useT";

// This control appears in more than one place at once on some pages (the sidebar's always
// present, and e.g. Settings/Auth also render their own copy) — a real failure seen in
// testing was two controls both exposed to assistive tech as the bare, identical name "EN",
// with no way to tell them apart. `context` lets each call site give its copy a distinct,
// fuller accessible name (e.g. "Sidebar: Switch to English") while the visible label stays
// the same short "EN"/"हिं" for sighted users.
export function LanguageToggle({ className = "", context }: { className?: string; context?: string }) {
  const { language, setLanguage } = useT();
  const prefix = context ? `${context}: ` : "";

  return (
    <div className={`inline-flex rounded-lg bg-gray-100 p-1 text-xs font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-label={`${prefix}Switch to English`}
        className={`cursor-pointer rounded-md px-2.5 py-1.5 ${
          language === "en" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("hi")}
        aria-label={`${prefix}हिंदी में बदलें`}
        className={`cursor-pointer rounded-md px-2.5 py-1.5 ${
          language === "hi" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
        }`}
      >
        हिं
      </button>
    </div>
  );
}
