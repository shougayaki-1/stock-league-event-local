import { ShieldCheck, Fingerprint, Loader2 } from "lucide-react";
import { useLoginPage } from "../hooks/useLoginPage";

import InitializingScreen from "../components/login/InitializingScreen";
import LoginSelection from "../components/login/LoginSelection";

export default function Login() {
  const {
    isInitializing, loading, loginMode, setLoginMode,
    inputID, setInputID,
    processLogin
  } = useLoginPage();

  if (isInitializing) {
    return <InitializingScreen />;
  }

  // ★ 修正：コンポーネントではなく単なるJSXとして定義する
  const loadingOverlayElement = (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300 text-white">
      <Fingerprint size={80} className="text-blue-500 animate-pulse mb-8" strokeWidth={1.5} />
      <div className="flex flex-col items-center">
        <Loader2 size={36} className="animate-spin text-blue-400 mb-4" />
        <h2 className="text-2xl font-black tracking-widest uppercase mb-2 drop-shadow-md">Authenticating</h2>
        <p className="text-slate-400 font-mono text-sm tracking-widest">エージェント資格を照会中...</p>
      </div>
    </div>
  );

  return (
    <>
      {loading && loadingOverlayElement}

      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-800 dark:text-white font-sans overflow-hidden relative transition-colors">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600 dark:bg-red-600 rounded-full blur-[120px]"></div>
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-600 dark:bg-blue-600 rounded-full blur-[120px]"></div>
        </div>

        <div className="max-w-md w-full text-center space-y-12 relative z-10">
          <div className="space-y-2">
            <h1 className="text-5xl font-black tracking-tighter italic text-blue-600 dark:text-red-600 drop-shadow-sm">株価にドキリ！</h1>
            <div className="flex items-center justify-center gap-2">
              <div className="h-px w-8 bg-slate-300 dark:bg-slate-800"></div>
              <p className="text-slate-400 dark:text-slate-500 font-black tracking-[0.3em] text-[10px] uppercase">Stock Trading Simulation</p>
              <div className="h-px w-8 bg-slate-300 dark:bg-slate-800"></div>
            </div>
          </div>

          <LoginSelection 
            loginMode={loginMode}
            setLoginMode={setLoginMode}
            inputID={inputID}
            setInputID={setInputID}
            processLogin={processLogin}
            loading={loading}
          />
          <footer className="pt-8"><div className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-full text-[10px] font-bold text-slate-500 uppercase tracking-widest"><ShieldCheck size={12} className="text-emerald-500" /> Secure Agent Portal v2.1</div></footer>
        </div>
      </div>
    </>
  );
}
