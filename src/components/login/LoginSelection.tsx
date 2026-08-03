import { QrCode, Keyboard, ArrowRight } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import { Card, CardContent } from "../ui/Card";
import QRScanner from "../admin/QRScanner";

interface LoginSelectionProps {
  loginMode: "choice" | "qr" | "manual";
  setLoginMode: (mode: "choice" | "qr" | "manual") => void;
  inputID: string;
  setInputID: (id: string) => void;
  processLogin: (id: string) => Promise<void>;
  loading: boolean;
}

export default function LoginSelection({
  loginMode,
  setLoginMode,
  inputID,
  setInputID,
  processLogin,
  loading
}: LoginSelectionProps) {
  return (
    <main className="space-y-4">
      {loginMode === "choice" && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 fade-in">
          <Button variant="secondary" onClick={() => setLoginMode("qr")} className="w-full flex items-center justify-between p-8 bg-white dark:bg-white text-slate-800 hover:bg-slate-100 rounded-3xl transition-all group shadow-xl">
            <div className="flex items-center gap-4 text-xl">
              <div className="p-3 bg-slate-100 dark:bg-slate-200 rounded-2xl group-hover:scale-110 transition-transform">
                <QrCode size={28} />
              </div>
              <span className="font-black">QRコードをスキャン</span>
            </div>
            <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
          </Button>
          <Button variant="outline" onClick={() => setLoginMode("manual")} className="w-full flex items-center justify-between p-8 bg-white/50 dark:bg-slate-900/50 rounded-3xl transition-all group hover:bg-white/80 dark:hover:bg-slate-800/80">
            <div className="flex items-center gap-4 text-xl">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl group-hover:scale-110 transition-transform">
                <Keyboard size={28} />
              </div>
              <span className="font-black text-slate-700 dark:text-slate-200">IDを手入力する</span>
            </div>
            <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform text-slate-500" />
          </Button>
        </div>
      )}

      {loginMode === "manual" && (
        <Card className="animate-in slide-in-from-right-8 fade-in duration-300">
          <CardContent className="p-8 space-y-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-black text-xl flex items-center gap-2"><Keyboard size={20} className="text-blue-500" /> ID入力</h2>
              <Button variant="ghost" size="sm" onClick={() => setLoginMode("choice")} className="hover:bg-slate-100 dark:hover:bg-slate-800">戻る</Button>
            </div>
            <Input
              type="text"
              value={inputID}
              onChange={e => setInputID(e.target.value)}
              placeholder="0000-xxxxxx"
              className="p-5 text-center font-mono text-2xl tracking-widest focus:ring-blue-500/20 transition-all"
              autoFocus
            />
            <Button onClick={() => processLogin(inputID)} disabled={loading || !inputID} className="w-full py-5 text-lg shadow-lg bg-blue-600 hover:bg-blue-500 transition-colors">
              ログイン
            </Button>
          </CardContent>
        </Card>
      )}

      {loginMode === "qr" && (
        <Card className="animate-in slide-in-from-left-8 fade-in duration-300 overflow-hidden">
          <CardContent className="p-8 space-y-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-black text-xl flex items-center gap-2"><QrCode size={20} className="text-blue-500" /> スキャン</h2>
              <Button variant="ghost" size="sm" onClick={() => setLoginMode("choice")} className="hover:bg-slate-100 dark:hover:bg-slate-800">戻る</Button>
            </div>

            <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-700">
              <QRScanner
                onScan={(id) => { setLoginMode("choice"); processLogin(id); }}
                onManualFallback={() => setLoginMode("manual")}
              />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xs font-black leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              注文台紙の<strong>左下</strong>にあるログイン用QRコードを読み取ってください。<br />右下のQRコードではログインできません。
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
