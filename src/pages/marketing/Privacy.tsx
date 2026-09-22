import { MarketingLayout } from "../../components/MarketingLayout";
import { useT } from "../../lib/i18n/useT";

const SECTIONS = [
  "infoWeCollect",
  "howWeUseIt",
  "dataStorage",
  "dataSharing",
  "yourChoices",
  "changes",
  "contact",
] as const;

export function Privacy() {
  const { t } = useT();

  return (
    <MarketingLayout>
      <h1 className="text-3xl font-bold text-gray-900">{t("marketing.privacyTitle")}</h1>
      <p className="mt-2 text-sm text-gray-400">{t("marketing.lastUpdated", { date: "2026-09-22" })}</p>

      <div className="mt-8 space-y-7">
        {SECTIONS.map((key) => (
          <section key={key}>
            <h2 className="text-base font-semibold text-gray-900">{t(`marketing.privacy.${key}.heading`)}</h2>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-600">{t(`marketing.privacy.${key}.body`)}</p>
          </section>
        ))}
      </div>
    </MarketingLayout>
  );
}
