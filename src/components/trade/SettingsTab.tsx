import React from "react";
import { Settings2, Wallet, LogOut } from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import ThemeToggle from "../ui/ThemeToggle";
import type { User } from "../../types/domain";
import HelpTab from "./HelpTab";

interface Props {
  user: User;
  newNickname: string;
  setNewNickname: (val: string) => void;
  handleUpdateNickname: () => void;
  isLoading: boolean;
  theme: "light" | "dark" | "system";
  setTheme: (val: "light" | "dark" | "system") => void;
  handleFinalize: () => void;
  handleLogout: () => void;
}

function SettingsTab({ user, newNickname, setNewNickname, handleUpdateNickname, isLoading, handleFinalize, handleLogout }: Props) {
  return (
    <section className="max-w-xl mx-auto space-y-8 animate-in fade-in duration-300 pt-4">
      <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2 mb-6"><Settings2 className="text-slate-500" /> エージェント設定</h2>
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-8">
        <div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input label="ニックネームの変更" value={newNickname} onChange={e => setNewNickname(e.target.value)} maxLength={20} />
            </div>
            <Button onClick={handleUpdateNickname} isLoading={isLoading} className="shrink-0 h-[46px] w-[46px] p-0"><Settings2 size={18} /></Button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">テーマ・外観</label>
          <ThemeToggle showText />
        </div>
        
        <div className="pt-8 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div>
            <label className="block text-xs font-bold text-amber-600 dark:text-amber-500 mb-2">ミッションの終了と帰還</label>
            {user.isFinished ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-center text-xs font-bold leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                利益は確定済みです。この状態は保持されたまま、スマホから取引を続けられます。
              </p>
            ) : (
              <>
                <Button variant="outline" className="w-full text-amber-600 border-amber-200 dark:text-amber-500 dark:border-amber-900/50 hover:bg-amber-50 dark:hover:bg-amber-950/30 py-4" onClick={handleFinalize} isLoading={isLoading}>
                  <Wallet size={18} className="mr-2" /> 利益を確定し、デジタル引換券を発行する
                </Button>
                <p className="text-[10px] text-slate-400 mt-2 text-center leading-relaxed">
                  ※全株が売却され、ランキングに登録されます。<br/>
                  発行された引換券画面をスタッフに提示してください。
                </p>
              </>
            )}
          </div>
          <div className="pt-4">
            <Button variant="ghost" className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50" onClick={handleLogout}>
              <LogOut size={16} className="mr-2" /> ログアウトする
            </Button>
            <p className="text-[10px] text-slate-400 mt-2 text-center font-mono">Device ID: {user.uid}</p>
          </div>
        </div>
        
      </div>
      <div className="border-t border-slate-200 pt-2 dark:border-slate-800">
        <HelpTab user={user} />
      </div>
    </section>
  );
}

export default React.memo(SettingsTab);
