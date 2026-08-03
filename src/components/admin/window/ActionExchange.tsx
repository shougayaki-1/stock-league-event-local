import type { User, PrizeGrade } from "../../../types/domain";
import { getPrizeGrade } from "../../../lib/utils"; 
import { useWindowActions } from "../../../hooks/useWindowActions";
import { useClassroomActions } from "../../../hooks/useClassroomActions";
import Button from "../../ui/Button";
import { LogOut, RotateCcw, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { useDialog } from "../../../contexts/DialogContext";

interface Props {
  user: User;
  prizes: PrizeGrade[];
  onSuccess: () => void;
  onNextCustomer: () => void;
}

export default function ActionExchange({ user, prizes, onSuccess, onNextCustomer }: Props) {
  const { executeFinalize, undoFinalize, isLoading } = useWindowActions();
  const { settings, saveSettings, checkOutAfterExchange, isProcessing, setIsProcessing } = useClassroomActions();
  const { alert } = useDialog();
  const [justFinalized, setJustFinalized] = useState(false);

  const handleFinalize = async () => {
    const success = await executeFinalize(user.uid);
    if (success) {
      if (settings.autoCheckoutOnExchange && user.isInClass) {
        setIsProcessing(true);
        try {
          await checkOutAfterExchange(user);
        } catch (error) {
          await alert({
            title: "退出処理エラー",
            message: `利益確定は完了しましたが、自動退出に失敗しました。\n${error instanceof Error ? error.message : "入退室画面から手動で退出してください。"}`,
            variant: "warning"
          });
        } finally {
          setIsProcessing(false);
        }
      }
      setJustFinalized(true);
      onSuccess();
    }
  };

  const handleUndoFinalize = async () => {
    // 確定後に別窓口で追加取引が行われた場合、復元対象は最後の確定前 snapshot に限定される。
    const success = await undoFinalize(user.uid);
    if (success) {
      setJustFinalized(false);
      onSuccess();
    }
  };

  const handleNextCustomer = () => {
    setJustFinalized(false);
    onNextCustomer();
  };

  if (user.isFinished || justFinalized) {
    const prize = getPrizeGrade(user.points, prizes);
    return (
      <div className="bg-warning-container border border-warning/40 p-6 rounded-2xl text-center">
        <p className="font-bold text-on-warning-container text-xl mb-4">利益確定済みです</p>
        <div className="bg-white dark:bg-slate-900 inline-block px-8 py-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 font-bold mb-1">お渡しする景品 (Grade: {prize.grade})</p>
          <p className="text-3xl font-black text-slate-800 dark:text-white">{prize.desc}</p>
          {user.courseType === "INSIDER" && (
             <p className="text-red-500 font-bold text-sm mt-3 bg-red-50 dark:bg-red-950/50 py-1 px-3 rounded-lg">※インサイダーにも特別参加賞としてお渡しします</p>
          )}
        </div>
        {justFinalized && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" size="lg" onClick={handleNextCustomer} className="justify-center">
              <UserRoundCheck size={18} className="mr-2" /> 次のお客様へ
            </Button>
            <Button variant="outline" size="lg" onClick={handleUndoFinalize} isLoading={isLoading} className="justify-center">
              <RotateCcw size={18} className="mr-2" /> 元に戻す
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm dark:border-amber-900/50 dark:bg-slate-900">
      <p className="text-slate-500 dark:text-slate-400 font-bold mb-6">全株を現在の価格で売却して利益を確定します。確定後も取引を続けられます。</p>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-slate-800 dark:bg-slate-950">
        <span>
          <span className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100"><LogOut size={16} /> 景品交換後に自動退出</span>
          <span className="mt-1 block text-xs font-bold text-slate-500">利益確定が成功したら、入室中の参加者をそのまま退出済みにします。</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-amber-500"
          checked={settings.autoCheckoutOnExchange}
          onChange={e => saveSettings({ autoCheckoutOnExchange: e.target.checked })}
        />
      </label>
      <Button 
        variant="primary" 
        size="lg" 
        className="w-full bg-gradient-to-r from-amber-500 to-orange-500 border-none shadow-lg shadow-amber-500/30 text-white text-xl" 
        onClick={handleFinalize}
        isLoading={isLoading || isProcessing}
      >
        💰 利益を確定する
      </Button>
      <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">失敗した場合はエラーを確認し、通信状況を整えてから再試行してください。</p>
    </div>
  );
}
