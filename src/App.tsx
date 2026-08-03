import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
// PWAの自動更新検知フック
import { useRegisterSW } from "virtual:pwa-register/react";

// Providers
import { ThemeProvider } from "./contexts/ThemeContext";
import { DialogProvider } from "./contexts/DialogContext";

import { useSystemSettings } from "./hooks/useFirebase";
import AdminRouteGuard from "./components/admin/AdminRouteGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import { isCriticalOperationActive, subscribeCriticalOperations } from "./lib/criticalOperation";

const CURRENT_CLIENT_VERSION = "2.1.0";
const Login = lazy(() => import("./pages/Login"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const Trade = lazy(() => import("./pages/Trade"));
const Result = lazy(() => import("./pages/Result"));
const Terminal = lazy(() => import("./pages/Terminal"));
const TerminalLayout = lazy(() => import("./components/terminal/TerminalLayout"));
const Signage = lazy(() => import("./pages/Signage"));
const PublicSignage = lazy(() => import("./pages/signage/PublicSignage"));
const RiddleSignage = lazy(() => import("./pages/signage/RiddleSignage"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const WindowOperation = lazy(() => import("./pages/admin/WindowOperation"));
const ClassroomOperation = lazy(() => import("./pages/admin/ClassroomOperation"));
const MarketControl = lazy(() => import("./pages/admin/MarketControl"));
const ScenarioControl = lazy(() => import("./pages/admin/ScenarioControl"));
const McControl = lazy(() => import("./pages/admin/McControl"));
const UsersManagement = lazy(() => import("./pages/admin/UsersManagement"));
const OrderPrintPage = lazy(() => import("./pages/admin/OrderPrintPage"));
const TransactionLogs = lazy(() => import("./pages/admin/TransactionLogs"));
const PublicSignageManage = lazy(() => import("./pages/admin/PublicSignageManage"));
const RiddleSignageManage = lazy(() => import("./pages/admin/RiddleSignageManage"));
const VideoLibrary = lazy(() => import("./pages/admin/VideoLibrary"));
const ImageLibrary = lazy(() => import("./pages/admin/ImageLibrary"));
const ImageTemplateStudio = lazy(() => import("./pages/admin/ImageTemplateStudio"));
const SignagePlaylistLibrary = lazy(() => import("./pages/admin/SignagePlaylistLibrary"));
const NewsPresetLibrary = lazy(() => import("./pages/admin/NewsPresetLibrary"));
const SystemSettings = lazy(() => import("./pages/admin/SystemSettings"));
const PrivacyPolicy = lazy(() => import("./pages/docs/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/docs/TermsOfService"));
const AdminManual = lazy(() => import("./pages/docs/AdminManual"));

function RouteFallback() {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center font-black tracking-widest uppercase">
      Loading
    </div>
  );
}

// サイネージは長時間無人で表示され続けるため、強制リロードで映像・ウェイクロック等を中断させない
const isSignageRoute = () =>
  typeof window !== "undefined" && window.location.pathname.startsWith("/signage");

function App() {
  const systemSettings = useSystemSettings();

  // ★ PWAのアップデート検知と自動リロード
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegistered(r) {
      // 1時間に1回、バックグラウンドで最新版がないかチェック（サイネージは対象外）
      if (r) {
        setInterval(() => {
          if (!isSignageRoute()) r.update();
        }, 60 * 60 * 1000);
      }
    }
  });

  // 最新版が見つかったら強制的にリロードして反映（サイネージ画面は次回アクセス時まで据え置く）
  useEffect(() => {
    if (!needRefresh || isSignageRoute()) return;
    const applyWhenIdle = () => {
      if (!isCriticalOperationActive()) void updateServiceWorker(true);
    };
    applyWhenIdle();
    return subscribeCriticalOperations(applyWhenIdle);
  }, [needRefresh, updateServiceWorker]);

  // ★ システム設定のバージョンが現在のアプリバージョンと異なる場合、キャッシュを強制クリアしてリロード
  // （サイネージ画面は表示継続を優先し、対象外とする）
  useEffect(() => {
    if (isSignageRoute()) return;
    if (systemSettings && systemSettings.clientVersion && systemSettings.clientVersion !== CURRENT_CLIENT_VERSION) {
      const reloadKey = `client-version-reload:${systemSettings.clientVersion}`;
      if (sessionStorage.getItem(reloadKey) === "1") {
        console.error(`Version mismatch remains after reload: local=${CURRENT_CLIENT_VERSION}, remote=${systemSettings.clientVersion}`);
        return;
      }
      console.log(`Version mismatch: local=${CURRENT_CLIENT_VERSION}, remote=${systemSettings.clientVersion}. Clearing cache and reloading...`);
      const reloadWhenIdle = () => {
        if (isCriticalOperationActive()) return;
        sessionStorage.setItem(reloadKey, "1");
        if (typeof window !== "undefined" && window.caches) {
          window.caches.keys().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
            .finally(() => window.location.reload());
        } else {
          window.location.reload();
        }
      };
      reloadWhenIdle();
      return subscribeCriticalOperations(reloadWhenIdle);
    }
  }, [systemSettings]);

  return (
    <ThemeProvider defaultTheme="system">
      <DialogProvider>
        <BrowserRouter>
          <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Trade />} />
              <Route path="/login" element={<Login />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/result" element={<Result />} />
              <Route path="/info" element={<Navigate to="/login?tab=help" replace />} />
              {/* サイネージ表示用（無人端末で使うためログイン不要） */}
              <Route path="/signage" element={<Signage />} />
              <Route path="/signage/public" element={<PublicSignage />} />
              <Route path="/signage/riddle" element={<RiddleSignage />} />

              {/* 端末・窓口オペレーション */}
              <Route element={<AdminRouteGuard allowedRoles={["terminal", "general", "core"]} />}>
                <Route path="/terminal" element={<TerminalLayout />}>
                  <Route index element={<Terminal />} />
                  <Route path="trade" element={<WindowOperation mode="trade" />} />
                  <Route path="exchange" element={<WindowOperation mode="exchange" />} />
                  <Route path="reception" element={<WindowOperation mode="reception" />} />
                  <Route path="classroom" element={<ClassroomOperation />} />
                  <Route path="mc" element={<McControl />} />
                  <Route path="signage-riddle" element={<RiddleSignageManage />} />
                </Route>
              </Route>

              {/* 管理者専用の保護されたルート */}
              <Route element={<AdminRouteGuard />}>
                {/* 管理画面 (AdminLayout でラップ) */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="/admin/market" replace />} />
                  <Route path="trade" element={<Navigate to="/terminal/trade" replace />} />
                  <Route path="exchange" element={<Navigate to="/terminal/exchange" replace />} />
                  <Route path="reception" element={<Navigate to="/terminal/reception" replace />} />
                  <Route path="classroom" element={<Navigate to="/terminal/classroom" replace />} />
                  
                  <Route path="market" element={<MarketControl />} />
                  <Route path="scenario" element={<ScenarioControl />} />
                  <Route path="mc" element={<McControl />} />
                  <Route path="users" element={<UsersManagement />} />
                  <Route path="order-cards" element={<OrderPrintPage />} />
                  <Route path="logs" element={<TransactionLogs />} />
                  <Route path="signage-public" element={<PublicSignageManage />} />
                  <Route path="signage-riddle" element={<RiddleSignageManage />} />
                  <Route path="video-library" element={<VideoLibrary />} />
                  <Route path="image-library" element={<ImageLibrary />} />
                  <Route path="image-template-studio" element={<ImageTemplateStudio />} />
                  <Route path="signage-playlists" element={<SignagePlaylistLibrary />} />
                  <Route path="news-presets" element={<NewsPresetLibrary />} />
                  <Route path="system" element={<SystemSettings />} />
                  <Route path="manual" element={<AdminManual />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </DialogProvider>
    </ThemeProvider>
  );
}

export default App;
