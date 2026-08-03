import type { User } from "../../../types/domain";
import { useWindowActions } from "../../../hooks/useWindowActions";
import Button from "../../ui/Button";
import { Key } from "lucide-react";

interface Props {
  user: User;
  onSuccess: () => void;
}

export default function ActionReception({ user, onSuccess }: Props) {
  const { upgradeToInsider, isLoading } = useWindowActions();

  const handleUpgrade = async () => {
    const success = await upgradeToInsider(user.uid);
    if (success) onSuccess();
  };

  if (user.courseType === "INSIDER") {
    return <div className="bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 p-6 rounded-2xl text-center font-bold">✅ すでにINSIDERコースです。そのまま案内してください。</div>;
  }

  return (
    <div className="text-center p-8 bg-white dark:bg-slate-900 rounded-2xl border border-pink-200 dark:border-pink-900/50 shadow-sm">
      <p className="text-slate-500 dark:text-slate-400 font-bold mb-6">謎解きミッション参加者としてステータスを変更します。</p>
      <Button 
        variant="primary" 
        size="lg" 
        className="w-full bg-gradient-to-r from-pink-500 to-rose-500 border-none shadow-lg shadow-pink-500/30 text-white text-xl" 
        onClick={handleUpgrade}
        isLoading={isLoading}
      >
        <Key className="mr-2"/> インサイダーへ昇格させる
      </Button>
    </div>
  );
}