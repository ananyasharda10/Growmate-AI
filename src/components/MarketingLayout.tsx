import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogoMark } from "./ui/Logo";
import { LanguageToggle } from "./LanguageToggle";
import { useT } from "../lib/i18n/useT";

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={30} />
            <span className="text-base font-bold text-gray-900">{t("common.appName")}</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
            <Link to="/about" className="hidden hover:text-brand-700 sm:inline">
              {t("marketing.navAbout")}
            </Link>
            <Link to="/pricing" className="hidden hover:text-brand-700 sm:inline">
              {t("marketing.navPricing")}
            </Link>
            <Link to="/auth" className="hover:text-brand-700">
              {t("marketing.navSignIn")}
            </Link>
            <LanguageToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">{children}</main>

      <footer className="border-t border-gray-100 py-6">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-5 gap-y-2 px-4 text-xs text-gray-500">
          <Link to="/about" className="hover:text-brand-700">
            {t("marketing.navAbout")}
          </Link>
          <Link to="/pricing" className="hover:text-brand-700">
            {t("marketing.navPricing")}
          </Link>
          <Link to="/terms" className="hover:text-brand-700">
            {t("marketing.navTerms")}
          </Link>
          <Link to="/privacy" className="hover:text-brand-700">
            {t("marketing.navPrivacy")}
          </Link>
        </div>
        <p className="mt-3 text-center text-xs text-gray-400">
          {t("marketing.footerCopyright", { year: new Date().getFullYear(), appName: t("common.appName") })}
        </p>
      </footer>
    </div>
  );
}
