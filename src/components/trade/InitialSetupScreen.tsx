import React from "react";
import Input from "../ui/Input";
import Button from "../ui/Button";

interface InitialSetupScreenProps {
  setupNickname: string;
  setSetupNickname: (nickname: string) => void;
  handleInitialSetup: (e: React.FormEvent) => Promise<void>;
  isLoading: boolean;
}

export default function InitialSetupScreen({
  setupNickname,
  setSetupNickname,
  handleInitialSetup,
  isLoading
}: InitialSetupScreenProps) {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-800 dark:text-white font-sans relative z-[500] transition-colors">
      <div className="absolute inset-0 bg-blue-500/10 blur-3xl"></div>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full relative z-10 animate-in zoom-in-95">
        <h2 className="text-2xl font-black mb-2 text-slate-800 dark:text-white">Welcome Agent.</h2>
        <p className="text-slate-500 text-xs mb-8">市場へアクセスする前に、あなたの「コードネーム（通信用の名前）」を登録してください。</p>
        <form onSubmit={handleInitialSetup} className="space-y-6">
          <Input 
            label="ニックネーム (最大20文字)" 
            value={setupNickname} 
            onChange={e => setSetupNickname(e.target.value)} 
            placeholder="例: ナナシ" 
            maxLength={20} 
            required 
            autoFocus 
            className="font-bold text-lg focus:border-blue-500" 
          />
          <Button 
            type="submit" 
            isLoading={isLoading} 
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg shadow-lg shadow-blue-900/20"
          >
            登録して開始する
          </Button>
        </form>
      </div>
    </div>
  );
}
