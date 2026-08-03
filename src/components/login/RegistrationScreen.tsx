import React from "react";
import { Card, CardContent } from "../ui/Card";
import Badge from "../ui/Badge";
import Input from "../ui/Input";
import Button from "../ui/Button";

interface RegistrationScreenProps {
  targetID: string;
  nickname: string;
  setNickname: (nickname: string) => void;
  handleRegister: (e: React.FormEvent) => Promise<void>;
  loading: boolean;
}

export default function RegistrationScreen({
  targetID,
  nickname,
  setNickname,
  handleRegister,
  loading
}: RegistrationScreenProps) {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-800 dark:text-white font-sans transition-colors">
      <Card className="max-w-sm w-full animate-in zoom-in-95 duration-300 shadow-2xl">
        <CardContent className="p-8">
          <Badge variant="info" className="mb-4 animate-pulse">New Agent Detected</Badge>
          <h2 className="text-2xl font-black mb-1">エージェント登録</h2>
          <p className="text-slate-500 text-xs mb-8 font-mono tracking-tighter">SECURE ID: {targetID}</p>
          
          <form onSubmit={handleRegister} className="space-y-6">
            <Input 
              label="通信時のニックネーム (20文字以内)" 
              value={nickname} 
              onChange={e => setNickname(e.target.value)} 
              placeholder="例: ナナシ" 
              maxLength={20} 
              required 
              className="font-bold text-lg focus:border-blue-500"
            />
            <Button type="submit" isLoading={loading} className="w-full py-4 text-lg bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all">
              市場へ潜入を開始する
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
