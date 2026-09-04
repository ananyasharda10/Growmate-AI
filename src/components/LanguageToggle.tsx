import { useT } from "../lib/i18n/useT";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useT();

  return (
    <div className={`inline-flex rounded-lg bg-gray-100 p-1 text-xs font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={`cursor-pointer rounded-md px-2.5 py-1.5 ${
          language === "en" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("hi")}
        className={`cursor-pointer rounded-md px-2.5 py-1.5 ${
          language === "hi" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
        }`}
      >
        हिं
      </button>
    </div>
  );
}
