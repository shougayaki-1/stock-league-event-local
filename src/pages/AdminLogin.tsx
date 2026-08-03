import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, type Location } from "react-router-dom";
import { onAuthStateChanged, signInWithEmailAndPassword, type User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useDialog } from "../contexts/DialogContext";
import { useSound } from "../hooks/useSound";
import { ShieldAlert, KeyRound, Mail, Loader2 } from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { Card, CardContent } from "../components/ui/Card";
import ThemeToggle from "../components/ui/ThemeToggle";
import { getAdminRole } from "../services/admin";

type LoginLocationState = {
  from?: Location;
};

function getRequestedPath(location: Location): string | null {
  const state = location.state as LoginLocationState | null;
  const from = state?.from;
  if (!from?.pathname || from.pathname === "/admin/login") return null;
  return `${from.pathname}${from.search}${from.hash}`;
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { alert } = useDialog();
  const { playSound, initAudioContext } = useSound();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingMethod, setLoadingMethod] = useState<"password" | null>(null);
  const processingUserRef = useRef<string | null>(null);

  const completeAdminLogin = useCallback(async (user: User) => {
    if (processingUserRef.current === user.uid) return;
    processingUserRef.current = user.uid;

    const role = await getAdminRole(user);
    const requestedPath = getRequestedPath(location);
    if (role === "terminal") {
      playSound("NEWS_ALERT");
      navigate(requestedPath?.startsWith("/terminal") ? requestedPath : "/terminal", { replace: true });
      return;
    }

    if (role === "general" || role === "core") {
      playSound("NEWS_ALERT");
      navigate(
        requestedPath?.startsWith("/admin") || requestedPath?.startsWith("/terminal")
          ? requestedPath
          : "/admin",
        { replace: true }
      );
      return;
    }

    await auth.signOut();
    await alert({
      title: "アクセス拒否",
      message: "このアカウントは管理者権限を持っていません。",
      variant: "danger"
    });
    processingUserRef.current = null;
    setLoadingMethod(null);
  }, [alert, location, navigate, playSound]);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || cancelled) return;

      setLoadingMethod("password");
      void completeAdminLogin(user).catch((err: unknown) => {
        console.error(err);
        processingUserRef.current = null;
        setLoadingMethod(null);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [completeAdminLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    initAudioContext();
    setLoadingMethod("password");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await completeAdminLogin(userCredential.user);
    } catch (err: unknown) {
      console.error(err);
      await alert({
        title: "ログインエラー",
        message: "メールアドレスまたはパスワードが正しくありません。",
        variant: "danger"
      });
      setLoadingMethod(null);
    }
  };

  const isLoading = loadingMethod !== null;

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-900 dark:text-white font-sans overflow-hidden relative transition-colors">
      <div className="absolute top-6 right-6 z-20 w-56">
        <ThemeToggle className="w-full shadow-lg backdrop-blur-md bg-white/80 dark:bg-slate-950/80" />
      </div>

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-red-600 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-600 rounded-full blur-[120px]"></div>
      </div>

      <div className="max-w-md w-full text-center space-y-8 relative z-10">
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tighter italic text-red-600 dark:text-red-500 drop-shadow-sm flex items-center justify-center gap-2">
            <ShieldAlert size={36} className="text-red-600 dark:text-red-500 animate-pulse" /> 株価にドキリ！
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold tracking-widest text-[10px] uppercase">
            OPERATOR MANAGEMENT PORTAL
          </p>
        </div>

        <Card className="border-slate-200 dark:border-red-500/20 bg-white dark:bg-slate-900/60 backdrop-blur-md shadow-2xl">
          <CardContent className="p-8 space-y-6">
            <div className="text-left mb-2">
              <h2 className="font-black text-xl flex items-center gap-2 text-slate-800 dark:text-white">
                <KeyRound size={20} className="text-red-600 dark:text-red-500" /> 管理者サインイン
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">運営スタッフ用の管理認証画面です。</p>
            </div>

            <form onSubmit={handleLogin} action="#" className="space-y-4">
              <div className="text-left">
                <label className="text-sm font-medium text-on-surface-variant mb-1 block">メールアドレス</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
                    <Mail size={18} />
                  </span>
                  <Input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 text-base bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div className="text-left">
                <label className="text-sm font-medium text-on-surface-variant mb-1 block">パスワード</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
                    <KeyRound size={18} />
                  </span>
                  <Input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 text-base bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading || !email || !password}
                className="w-full py-4 text-base shadow-lg bg-red-600 hover:bg-red-500 dark:bg-red-600 dark:hover:bg-red-500 transition-colors flex items-center justify-center gap-2 text-white font-bold"
              >
                {loadingMethod === "password" ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> 認証中...
                  </>
                ) : (
                  "システムにログイン"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <footer className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
          Stock League Event Local Administration
        </footer>
      </div>
    </div>
  );
}
