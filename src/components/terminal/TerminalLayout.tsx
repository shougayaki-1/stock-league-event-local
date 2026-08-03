import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { DoorOpen, Gamepad2, Gift, Key, LogOut, Menu, RadioTower, ScanFace, Store, UserPlus, X } from "lucide-react";
import { auth } from "../../lib/firebase";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import ThemeToggle from "../ui/ThemeToggle";

const terminalItems = [
  { name: "端末ホーム", path: "/terminal", icon: <Gamepad2 size={18} />, end: true },
  { name: "証券窓口", path: "/terminal/trade", icon: <Store size={18} /> },
  { name: "景品交換窓口", path: "/terminal/exchange", icon: <Gift size={18} /> },
  { name: "謎解き受付", path: "/terminal/reception", icon: <UserPlus size={18} /> },
  { name: "入退室管理", path: "/terminal/classroom", icon: <DoorOpen size={18} /> },
  { name: "MCコントロール", path: "/terminal/mc", icon: <RadioTower size={18} /> },
  { name: "謎解き管理", path: "/terminal/signage-riddle", icon: <Key size={18} /> }
];

export default function TerminalLayout() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-white md:flex">
      <div className="md:hidden sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-center gap-3">
          <IconButton
            aria-label={isMobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="-ml-2"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </IconButton>
          <h1 className="flex items-center gap-2 text-lg font-black text-blue-600 dark:text-blue-400">
            <ScanFace size={20} /> Terminal
          </h1>
        </div>
        <IconButton aria-label="ログアウト" variant="subtle" onClick={handleLogout}>
          <LogOut size={20} />
        </IconButton>
      </div>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        fixed left-0 top-0 z-50 flex h-[100dvh] w-64 shrink-0 flex-col border-r border-slate-200
        bg-white shadow-xl transition-transform dark:border-slate-800 dark:bg-slate-950 md:sticky md:translate-x-0 md:shadow-none
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <h1 className="flex items-center gap-2 text-xl font-black text-blue-600 dark:text-blue-400">
            <ScanFace size={22} /> Terminal
          </h1>
          <IconButton aria-label="メニューを閉じる" size="sm" className="md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={20} />
          </IconButton>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {terminalItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-full px-3 py-2 text-sm font-black transition-colors ${
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-blue-300"
              }`}
            >
              {item.icon}
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <ThemeToggle />
          <Button variant="outline" className="w-full justify-center gap-2" onClick={handleLogout}>
            <LogOut size={16} /> ログアウト
          </Button>
        </div>
      </aside>

      <main className="touch-scroll min-w-0 flex-1 md:h-dvh md:overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
