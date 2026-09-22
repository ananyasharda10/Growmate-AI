import { Link } from "react-router-dom";
import { MarketingLayout } from "../../components/MarketingLayout";
import { Button } from "../../components/ui/Button";
import { useT } from "../../lib/i18n/useT";

export function Pricing() {
  const { t } = useT();
  const included = ["products", "money", "dues", "analytics", "advisor", "languages"] as const;

  return (
    <MarketingLayout>
      <h1 className="text-3xl font-bold text-gray-900">{t("marketing.pricingTitle")}</h1>
      <p className="mt-3 text-base text-gray-600">{t("marketing.pricingIntro")}</p>

      <div className="mt-8 rounded-2xl border border-brand-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t("marketing.pricingPlanName")}</p>
        <p className="mt-2 text-4xl font-bold text-gray-900">{t("marketing.pricingPlanPrice")}</p>
        <ul className="mt-6 space-y-2.5">
          {included.map((k) => (
            <li key={k} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-brand-600">✓</span>
              {t(`marketing.pricingIncluded.${k}`)}
            </li>
          ))}
        </ul>
        <Link to="/auth" className="mt-6 block">
          <Button fullWidth>{t("marketing.pricingCta")}</Button>
        </Link>
      </div>
    </MarketingLayout>
  );
}
