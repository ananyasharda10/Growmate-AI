import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import { useT } from "../lib/i18n/useT";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Field";
import { LogoMark } from "../components/ui/Logo";
import { LanguageToggle } from "../components/LanguageToggle";

export function Auth() {
  const navigate = useNavigate();
  const { t } = useT();
  const signIn = useStore((s) => s.signIn);
  const signUp = useStore((s) => s.signUp);
  const loadDemoData = useStore((s) => s.loadDemoData);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError(t("auth.passwordsDontMatch"));
        return;
      }
      if (!agreedToTerms) {
        setError(t("auth.mustAgreeToTerms"));
        return;
      }
    }
    setSubmitting(true);
    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? t("auth.genericError"));
      return;
    }
    navigate("/");
  }

  function handleDemo() {
    loadDemoData();
    navigate("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3">
            <LogoMark size={84} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t("auth.welcomeTitle", { appName: t("common.appName") })}</h1>
          <p className="mt-1 text-sm font-medium text-brand-600">{t("common.tagline")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("auth.subtitle")}</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`cursor-pointer rounded-md py-2 text-sm font-semibold ${
                mode === "signin" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
              }`}
            >
              {t("auth.signIn")}
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`cursor-pointer rounded-md py-2 text-sm font-semibold ${
                mode === "signup" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
              }`}
            >
              {t("auth.signUp")}
            </button>
          </div>

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
            <div>
              <Label>{t("auth.passwordLabel")}</Label>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {mode === "signup" && (
              <div>
                <Label>{t("auth.confirmPasswordLabel")}</Label>
                <Input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}
            {mode === "signin" && (
              <div className="text-right">
                <Link to="/forgot-password" className="text-xs font-medium text-brand-700 hover:underline">
                  {t("auth.forgotPasswordLink")}
                </Link>
              </div>
            )}
            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  {t("auth.agreeToTermsPre")}{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                    {t("marketing.navTerms")}
                  </a>{" "}
                  {t("auth.agreeToTermsAnd")}{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                    {t("marketing.navPrivacy")}
                  </a>
                  {t("auth.agreeToTermsSuffix")}
                </span>
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" fullWidth disabled={submitting}>
              {submitting ? t("common.pleaseWait") : mode === "signin" ? t("auth.signIn") : t("auth.signUp")}
            </Button>
          </form>
        </div>

        <button
          onClick={handleDemo}
          className="mt-4 w-full cursor-pointer text-center text-sm font-medium text-brand-700 hover:underline"
        >
          {t("auth.tryDemo")}
        </button>

        <div className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <Link to="/about" className="hover:text-gray-600">
            {t("marketing.navAbout")}
          </Link>
          <Link to="/pricing" className="hover:text-gray-600">
            {t("marketing.navPricing")}
          </Link>
          <Link to="/terms" className="hover:text-gray-600">
            {t("marketing.navTerms")}
          </Link>
          <Link to="/privacy" className="hover:text-gray-600">
            {t("marketing.navPrivacy")}
          </Link>
        </div>
      </div>
    </div>
  );
}
