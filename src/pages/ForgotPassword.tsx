import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Field";
import { LogoMark } from "../components/ui/Logo";

export function ForgotPassword() {
  const { t } = useT();
  const resetPassword = useStore((s) => s.resetPassword);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await resetPassword(email);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? t("auth.genericError"));
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3">
            <LogoMark size={64} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{t("auth.forgotPasswordTitle")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("auth.forgotPasswordSubtitle")}</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          {sent ? (
            <p className="text-sm text-gray-700">{t("auth.forgotPasswordSent", { email })}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>{t("auth.emailLabel")}</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" fullWidth disabled={submitting}>
                {submitting ? t("common.pleaseWait") : t("auth.sendResetLinkBtn")}
              </Button>
            </form>
          )}
        </div>

        <Link to="/auth" className="mt-4 block text-center text-sm font-medium text-brand-700 hover:underline">
          {t("auth.backToSignIn")}
        </Link>
      </div>
    </div>
  );
}
