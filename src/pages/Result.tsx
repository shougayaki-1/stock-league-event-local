import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { useUser, usePrizes } from "../hooks/useFirebase";
import { getPrizeGrade } from "../lib/utils"; 
import { useDialog } from "../contexts/DialogContext";
import { Ticket, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { callMarkTicketUsed } from "../services/functions";
import { formatExact } from "../lib/exactNumber";
import { STORAGE_KEYS } from "../lib/storageKeys";
import { usePlayerSession } from "../hooks/usePlayerSession";

export default function Result() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirm, alert } = useDialog();
  
  const requestedUserID = searchParams.get("userID") || localStorage.getItem(STORAGE_KEYS.USER_ID);
  const session = usePlayerSession(requestedUserID);
  const userID = session.status === "authenticated" ? session.uid : null;
  const user = useUser(userID);
  const prizes = usePrizes();
  const [isUpdating, setIsUpdating] = useState(false);

  // スクショ防止用のリアルタイム時計
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    let timeoutId: number | null = null;
    const scheduleNextTick = () => {
      const current = new Date();
      setNow(current);
      timeoutId = window.setTimeout(scheduleNextTick, 1000 - current.getMilliseconds());
    };
    scheduleNextTick();
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (session.status === "missing" || session.status === "error") navigate("/login");
  }, [session.status, navigate]);

  if (!user) return <div className="min-h-dvh bg-gray-950"></div>;

  if (!user.isFinished) {
    navigate("/");
    return null;
  }

  const isInsider = user.courseType === "INSIDER";
  // 通常利用者は、確定後に再ログインしても景品内容をスマホへ表示しない。
  // そのまま取引画面へ戻れるため、自宅でもゲームを継続できる。
  if (!isInsider) return <Navigate to="/" replace />;

  const prize = getPrizeGrade(user.points, prizes.grades);
  const isTicketUsed = user.isTicketUsed || false;

  const handleUseTicket = async () => {
    if (isTicketUsed || isUpdating) return;
    const isOk = await confirm({
      title: "チケットを使用しますか？",
      message: "スタッフの目の前で「使用する」を押してください。\n※この操作は取り消せません。",
      confirmText: "使用する",
      variant: "warning"
    });

    if (isOk) {
      setIsUpdating(true);
      try {
        await callMarkTicketUsed({ uid: user.uid });
        await alert({ title: "使用完了", message: "チケットを使用済みにしました。", variant: "success" });
      } catch (e) {
        console.error(e);
        await alert({ title: "エラー", message: "通信エラーが発生しました。", variant: "danger" });
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <div className={`min-h-dvh flex flex-col items-center justify-center p-4 font-sans transition-colors duration-1000 ${isInsider ? 'bg-red-950' : 'bg-gray-950'}`}>
      
      <div className={`max-w-md w-full p-8 rounded-[32px] shadow-2xl border relative overflow-hidden ${isInsider ? 'bg-gray-900 border-red-600' : 'bg-gray-900 border-gray-700'}`}>
        
        {/* スクショ防止の時計表示 (目立たせる) */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-black/80 text-green-400 border border-green-500/50 px-3 py-1 rounded-full font-mono text-sm shadow-[0_0_15px_rgba(34,197,94,0.3)]">
          <Clock size={14} className="animate-spin-slow" />
          <span className="font-bold tracking-wider">
            {now.toLocaleTimeString('ja-JP')}
          </span>
        </div>

        {/* 使用済みスタンプのオーバーレイ (背景は暗くしない) */}
        {isTicketUsed && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden">
            <div className="text-red-500 border-8 border-red-500 rounded-3xl p-6 transform -rotate-12 flex flex-col items-center shadow-[0_0_40px_rgba(239,68,68,0.4)] bg-black/40 backdrop-blur-[2px] opacity-90 scale-125">
              <span className="text-6xl font-black tracking-widest">USED</span>
              <span className="text-2xl font-bold mt-2">引換・利用済み</span>
            </div>
            <div className="absolute inset-0 bg-red-900/10 mix-blend-multiply pointer-events-none"></div>
          </div>
        )}

        {isInsider ? (
          <div className="text-center space-y-6 relative z-10 mt-6">
            <div className="text-red-500 font-bold text-5xl mb-4 animate-pulse"><AlertTriangle size={64} className="mx-auto"/></div>
            <h1 className="text-2xl font-bold text-red-500 tracking-widest">コンプライアンス違反を検知</h1>
            
            <div className="bg-black p-4 rounded-xl border border-red-800 text-left shadow-inner">
              <p className="text-red-300 text-sm leading-relaxed font-bold">エージェント <span className="text-white">{user.nickname}</span> は、一般に公開されていない**「機密情報」**を悪用した形跡が認められました。</p>
            </div>

            <div className="text-left space-y-3">
              <p className="text-gray-300 text-sm">現実の社会では、これを<strong className="text-red-400 text-base">「インサイダー取引」</strong>と呼びます。金融商品取引法で厳しく禁じられており、発覚した場合は<strong className="text-white">5年以下の懲役、もしくは500万円以下の罰金</strong>が科せられます。</p>
            </div>

            <div className="mt-6 pt-6 border-t border-red-900/50">
              <p className="text-red-400 text-sm mb-1">不正に得た最終資産</p>
              <p className="text-3xl sm:text-4xl font-mono font-bold text-red-500 break-all line-through opacity-80">{formatExact(user.points)} pt</p>            
            </div>

            <div className="bg-gradient-to-br from-yellow-600/30 to-red-900/50 border-2 border-yellow-500 p-6 rounded-2xl mt-4 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
              <p className="text-red-400 font-bold text-xs mb-3">ペナルティとして資産は無効化されますが…</p>
              <div className="flex items-center justify-center gap-2 mb-2 text-yellow-500"><Ticket size={24}/><span className="font-black tracking-widest">特別報酬チケット</span></div>
              <p className="text-white font-black text-2xl mb-2">{prize.desc}</p>
              <p className="text-[10px] text-gray-400 mt-2">※素晴らしい潜入の手腕を讃え、上記をお渡しします。</p>
              
              <button 
                onClick={handleUseTicket}
                disabled={isTicketUsed || isUpdating}
                className={`w-full mt-4 font-black py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${isTicketUsed ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-yellow-600 hover:bg-yellow-500 text-white active:scale-95"}`}
              >
                {isUpdating ? <Loader2 className="animate-spin" size={20} /> : null}
                {isTicketUsed ? "使用済み" : "スタッフに提示して使う"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-6 relative z-10 mt-6">
            <h1 className="text-3xl font-black text-white tracking-widest mb-2">MISSION COMPLETE</h1>
            <p className="text-gray-400 text-sm">お疲れ様でした、エージェント <span className="font-bold text-white">{user.nickname}</span>。</p>

            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 my-8 shadow-inner relative">
              <p className="text-gray-400 text-sm mb-2 font-bold tracking-widest">最終確定資産</p>
              <p className="text-4xl sm:text-5xl font-mono font-black text-blue-400 break-all">{formatExact(user.points)} <span className="text-2xl">pt</span></p>            
            </div>

            <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 border-2 border-blue-500 p-6 rounded-2xl shadow-[0_0_20px_rgba(59,130,246,0.2)] relative">
              <div className="flex items-center justify-center gap-2 mb-2 text-blue-400"><Ticket size={24}/><span className="font-black tracking-widest">景品引換チケット</span></div>
              <p className="text-blue-300 font-bold text-sm mb-1">獲得グレード：{prize.grade}</p>
              <p className="text-white font-black text-2xl mb-4">{prize.desc}</p>
              
              <button 
                onClick={handleUseTicket}
                disabled={isTicketUsed || isUpdating}
                className={`w-full font-black py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 ${isTicketUsed ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white active:scale-95"}`}
              >
                {isUpdating ? <Loader2 className="animate-spin" size={20} /> : null}
                {isTicketUsed ? "使用済み" : "スタッフに提示して使う"}
              </button>
            </div>
            <p className="text-gray-400 text-[10px] font-bold">※景品交換窓口、または連携企画のファストパスとしてご利用ください。</p>
          </div>
        )}

        <div className="mt-8 text-center border-t border-gray-800 pt-4">
          <p className="text-[10px] text-gray-500 font-mono">AGENT ID: {user.shortId}</p>
        </div>
      </div>
    </div>
  );
}
