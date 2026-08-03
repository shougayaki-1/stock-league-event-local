import { useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { ScanFace, Activity, Calendar, Users, ScrollText, Tv, Key, Settings, LayoutDashboard, Menu, X, ClipboardList, BookOpen, LogOut, RadioTower, Film, PlaySquare, Newspaper, Image, Sparkles } from "lucide-react";
import { auth } from "../../lib/firebase";
import IconButton from "../ui/IconButton";
import ThemeToggle from "../ui/ThemeToggle";
import Button from "../ui/Button";

interface MenuItem {
  name: string;
  path: string;
  icon: ReactNode;
  external?: boolean;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/admin/login", { replace: true });
  };

  const menuGroups: MenuGroup[] = [
    {
      title: "端末オペレーション",
      items: [
        { name: "情報照会端末 ↗", path: "/terminal", icon: <ScanFace size={18} />, external: true },
      ]
    },
    {
      title: "市場・シナリオ制御",
      items: [
        { name: "株価・マーケット制御", path: "/admin/market", icon: <Activity size={18} /> },
        { name: "シナリオ・ニュース予約", path: "/admin/scenario", icon: <Calendar size={18} /> },
        { name: "ニュースプリセット", path: "/admin/news-presets", icon: <Newspaper size={18} /> },
        { name: "MCコントロール", path: "/admin/mc", icon: <RadioTower size={18} /> },
      ]
    },
    {
      title: "エージェント管理",
      items: [
        { name: "ID発行・ステータス", path: "/admin/users", icon: <Users size={18} /> },
        { name: "注文カード印刷", path: "/admin/order-cards", icon: <ClipboardList size={18} /> },
        { name: "リアルタイム取引ログ", path: "/admin/logs", icon: <ScrollText size={18} /> },
      ]
    },
    {
      title: "サイネージ制御",
      items: [
        { name: "一般モニター管理", path: "/admin/signage-public", icon: <Tv size={18} /> },
        { name: "謎解きエリア管理", path: "/admin/signage-riddle", icon: <Key size={18} /> },
        { name: "動画ライブラリ", path: "/admin/video-library", icon: <Film size={18} /> },
        { name: "画像ライブラリ", path: "/admin/image-library", icon: <Image size={18} /> },
        { name: "画像テンプレート", path: "/admin/image-template-studio", icon: <Sparkles size={18} /> },
        { name: "プレイリストライブラリ", path: "/admin/signage-playlists", icon: <PlaySquare size={18} /> },
      ]
    },
    {
      title: "システム設定",
      items: [
        { name: "クロージング・景品", path: "/admin/system", icon: <Settings size={18} /> },
        { name: "管理者マニュアル", path: "/admin/manual", icon: <BookOpen size={18} /> },
      ]
    }
  ];

  return (
    <div className="min-h-dvh bg-surface-variant flex flex-col md:flex-row font-sans text-on-surface transition-colors">

      {/* スマホ用ヘッダー */}
      <div className="md:hidden h-16 bg-surface border-b border-outline-variant flex items-center justify-between px-4 sticky top-0 z-40 print:hidden shrink-0">
        <div className="flex items-center gap-3">
          <IconButton
            aria-label={isMobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="-ml-2"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </IconButton>
          <h1 className="text-lg font-semibold text-primary flex items-center gap-2">
            <LayoutDashboard size={18} /> 株価にドキリ！
          </h1>
        </div>
        <IconButton aria-label="ログアウト" variant="subtle" onClick={handleLogout}>
          <LogOut size={20} />
        </IconButton>
      </div>

      {/* スマホ用の半透明オーバーレイ */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 左サイドバー */}
      <aside className={`
        fixed md:sticky top-0 left-0 h-[100dvh] bg-surface border-r border-outline-variant
        flex flex-col w-64 shrink-0 elevation-3 md:elevation-1 z-50 print:hidden transition-transform duration-300
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-outline-variant shrink-0">
          <h1 className="text-xl font-semibold text-primary flex items-center gap-2">
            <LayoutDashboard size={20} /> 株価にドキリ！
          </h1>
          <IconButton aria-label="メニューを閉じる" size="sm" className="md:hidden -mr-2" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={20} />
          </IconButton>
        </div>

        {/* ★修正: スクロール領域を確保し、下部に十分な余白 (pb-24) を持たせる */}
        <div className="flex-1 overflow-y-auto overscroll-contain pb-24 p-4 space-y-6">
          {menuGroups.map((group, index) => (
            <div key={index}>
              <h2 className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2 px-2">
                {group.title}
              </h2>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.name}>
                    {item.external ? (
                      <a 
                        href={item.path} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-on-surface/8 hover:text-primary rounded-full transition-colors"
                      >
                        {item.icon} {item.name}
                      </a>
                    ) : (
                      <NavLink
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={({ isActive }) => `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-full transition-colors ${isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:bg-on-surface/8 hover:text-primary"}`}
                      >
                        {item.icon} {item.name}
                      </NavLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ★修正: Themeトグル部分はスクロールされずに常に一番下に固定する */}
        <div className="p-4 border-t border-outline-variant shrink-0 bg-surface pb-safe">
          <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-widest mb-2 px-2">Theme</p>
          <ThemeToggle />
          <Button variant="outline" className="mt-3 w-full justify-center gap-2" onClick={handleLogout}>
            <LogOut size={16} /> ログアウト
          </Button>
        </div>
      </aside>

      <main className="touch-scroll flex-1 flex flex-col min-w-0 md:h-dvh overflow-y-auto bg-surface-variant transition-colors print:w-full print:h-auto print:overflow-visible pb-24 md:pb-0">
        <Outlet />
      </main>
      
    </div>
  );
}
