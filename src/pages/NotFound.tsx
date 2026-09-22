import { Link } from "react-router-dom";
import { useT } from "../lib/i18n/useT";
import { Button } from "../components/ui/Button";
import { LogoMark } from "../components/ui/Logo";

export function NotFound() {
  const { t } = useT();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page px-4 text-center">
      <LogoMark size={64} />
      <h1 className="mt-6 text-3xl font-bold text-gray-900">{t("notFound.title")}</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-500">{t("notFound.subtitle")}</p>
      <Link to="/" className="mt-6">
        <Button>{t("notFound.backBtn")}</Button>
      </Link>
    </div>
  );
}
