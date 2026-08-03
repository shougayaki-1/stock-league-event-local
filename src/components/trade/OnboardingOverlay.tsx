import { useState } from "react";
import Button from "../ui/Button";

export default function OnboardingOverlay() {
  // useEffectを使わず、初期化時に1回だけlocalStorageを確認する（遅延初期化）
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem("insider_onboarding_done");
  });
  const [step, setStep] = useState(1);

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      setIsVisible(false);
      localStorage.setItem("insider_onboarding_done", "true");
    }
  };

  if (!isVisible) return null;

  return (
    // z-[1000] を z-1000 に修正
    <div className="fixed inset-0 z-1000 flex items-center justify-center pointer-events-auto">
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>

      <div className="relative z-10 w-full max-w-sm p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-blue-500 animate-in zoom-in-95">
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-2 rounded-full flex-1 ${i <= step ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`}></div>
          ))}
        </div>

        {step === 1 && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-black text-blue-600 dark:text-blue-400">市場へようこそ</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
              あなたのミッションは、<strong className="text-red-500">情報を読んで株を売買し、資産を最大化すること</strong>です。
            </p>
            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl text-left border border-slate-200 dark:border-slate-700">
              <p className="text-red-500 font-bold mb-1">↑ 株価が上がりそうな時</p>
              <p className="text-xs text-slate-500 mb-4">今のうちに「買う」</p>
              <p className="text-blue-500 font-bold mb-1">↓ 株価が下がりそうな時</p>
              <p className="text-xs text-slate-500">持っている株を「売る」</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-black text-blue-600 dark:text-blue-400">情報が命です</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
              株価が動く前には、必ず<strong className="text-emerald-500">「ニュース」</strong>が流れます。
            </p>
            <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-xl text-left border border-emerald-200 dark:border-emerald-800">
              <p className="font-black text-emerald-700 dark:text-emerald-400 mb-2">ニュースタブを常にチェック</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                下部の「News」ボタンから、最新の情報を確認しましょう。速報が届くと画面上部にも通知が出ます。
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-black text-blue-600 dark:text-blue-400">準備はいいですか？</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-bold">
              増やした資産は、最後に窓口で豪華な景品と交換できます。
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/30 p-4 rounded-xl text-left border border-amber-200 dark:border-amber-800">
              <p className="font-black text-amber-700 dark:text-amber-400 mb-2">帰る前に利益確定を！</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                下部の「Settings」から利益を確定し、ゲームを終了させてください。
              </p>
            </div>
          </div>
        )}

        <Button className="w-full mt-8 py-4 text-lg" onClick={handleNext}>
          {step < 3 ? "次へ" : "トレードを開始する"}
        </Button>
      </div>
    </div>
  );
}