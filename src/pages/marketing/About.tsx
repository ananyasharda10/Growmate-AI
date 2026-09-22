import { MarketingLayout } from "../../components/MarketingLayout";
import { useT } from "../../lib/i18n/useT";

export function About() {
  const { t } = useT();
  const features = [
    "inventory",
    "money",
    "dues",
    "analytics",
    "advisor",
    "bilingual",
  ] as const;

  return (
    <MarketingLayout>
      <h1 className="text-3xl font-bold text-gray-900">{t("marketing.aboutTitle", { appName: t("common.appName") })}</h1>
      <p className="mt-3 text-base text-gray-600">{t("marketing.aboutIntro")}</p>
      <p className="mt-3 text-base text-gray-600">{t("marketing.aboutWhoFor")}</p>

      <h2 className="mt-10 text-xl font-semibold text-gray-900">{t("marketing.featuresTitle")}</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-brand-700">{t(`marketing.feature.${f}.title`)}</h3>
            <p className="mt-1.5 text-sm text-gray-600">{t(`marketing.feature.${f}.body`)}</p>
          </div>
        ))}
      </div>
    </MarketingLayout>
  );
}
