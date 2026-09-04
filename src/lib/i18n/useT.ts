import { useStore } from "../../store/useStore";
import { t, type Language } from "./index";

export function useT() {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  return {
    language,
    setLanguage,
    t: (key: string, vars?: Record<string, string | number>) => t(language, key, vars),
  };
}

export type { Language };
