import en from "./en";
import hi from "./hi";

export type Language = "en" | "hi";
export type Translations = typeof en;

const dictionaries: Record<Language, Translations> = { en, hi };

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function t(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const value = get(dictionaries[lang], key) ?? get(dictionaries.en, key);
  if (typeof value !== "string") return key;
  return interpolate(value, vars);
}
