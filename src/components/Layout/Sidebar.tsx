import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Package,
  Wallet,
  Users,
  BarChart3,
  Sparkles,
  Settings as SettingsIcon,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { useStore } from "../../store/useStore";
import { useT } from "../../lib/i18n/useT";
import { LogoMark } from "../ui/Logo";
import { LanguageToggle } from "../LanguageToggle";

const navItems = [
  { to: "/", key: "dashboard", icon: LayoutGrid, end: true },
  { to: "/inventory", key: "inventory", icon: Package, end: false },
  { to: "/money", key: "money", icon: Wallet, end: false },
  { to: "/dues", key: "dues", icon: Users, end: false },
  { to: "/analytics", key: "analytics", icon: BarChart3, end: false },
  { to: "/advisor", key: "advisor", icon: Sparkles, end: false },
  { to: "/settings", key: "settings", icon: SettingsIcon, end: false },
] as const;

export function Sidebar({ onShowTour }: { onShowTour: () => void }) {
  const { t } = useT();
  const session = useStore((s) => s.session);
  const signOut = useStore((s) => s.signOut);
  const businessName = useStore((s) => s.settings.businessName);

  const initial = (session?.name ?? session?.email ?? "?").charAt(0).toUpperCase();

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-gray-100 bg-white px-4 py-6">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <LogoMark size={42} />
        <span className="text-lg font-bold text-gray-900">{businessName || t("common.appName")}</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ to, key, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-brand-50 hover:text-brand-700"
              }`
            }
          >
            <Icon size={18} />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <div className="mb-3 px-1">
          <LanguageToggle className="w-full [&>button]:flex-1" />
        </div>
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-brand-50 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{session?.email}</p>
            <p className="text-xs text-gray-500">{t("nav.role")}</p>
          </div>
        </div>
        <button
          onClick={onShowTour}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <HelpCircle size={16} />
          {t("nav.takeTour")}
        </button>
        <button
          onClick={signOut}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <LogOut size={16} />
          {t("nav.signOut")}
        </button>
      </div>
    </aside>
  );
}
