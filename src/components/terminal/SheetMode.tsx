// src/components/terminal/SheetMode.tsx

import { useState, useCallback, useEffect, useRef } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useStocks } from "../../hooks/useFirebase";
import type { User } from "../../types/domain";
import { useWindowActions } from "../../hooks/useWindowActions";
import { ScanLine, RefreshCw, AlertTriangle, CheckCircle, ArrowLeft } from "lucide-react";
import { detectAlignmentMarks, parseSheet, type ParsedSheetData } from "../../lib/sheetParser";
import Button from "../ui/Button";
import Badge from "../ui/Badge";

interface Props {
  clearTimer: number;
  onReturnPortal: () => void;
}

interface Point {
  x: number;
  y: number;
}

export default function SheetMode({ clearTimer, onReturnPortal }: Props) {
  const stocks = useStocks();
  const { executeTerminalTrade } = useWindowActions();
  void clearTimer;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 直近N フレームの検出結果を蓄積して中央値で安定化
  const HISTORY_LEN = 5;
  const historyRef = useRef<Point[][]>([]);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isScanning, setIsScanning] = useState(true);
  const [parsedData, setParsedData] = useState<ParsedSheetData | null>(null);
  const [matchedUser, setSelectedUser] = useState<User | null>(null);

  const [tradeStatus, setTradeStatus] = useState<"IDLE" | "CONFIRMING" | "PROCESSING" | "SUCCESS" | "ERROR">("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const lookupUser = useCallback(async (shortId: string) => {
    try {
      const q = query(collection(db, "users"), where("shortId", "==", shortId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const u = snap.docs[0].data() as User;
        setSelectedUser(u);
        setTradeStatus("CONFIRMING");
      } else {
        setErrorMessage("エージェントIDが見つかりません。(" + shortId + ")");
        setTradeStatus("ERROR");
      }
    } catch {
      setErrorMessage("ユーザー情報の照会に失敗しました。");
      setTradeStatus("ERROR");
    }
  }, []);

  const handleReset = useCallback(() => {
    historyRef.current = [];
    setParsedData(null);
    setSelectedUser(null);
    setTradeStatus("IDLE");
    setErrorMessage(null);
    setIsScanning(true);
  }, []);

  // カメラ起動
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" }
    })
      .then((s) => {
        activeStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(err => console.error("Camera play failed:", err));
        }
      })
      .catch((err) => {
        setCameraError("カメラへの接続に失敗しました: " + err.message);
      });

    return () => {
      activeStream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // メインスキャンループ
  useEffect(() => {
    if (!stream || !isScanning) return;

    let active = true;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const scanLoop = () => {
      if (!active) return;

      if (video.readyState >= 2) {
        ctx.save();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        // ① 画面全体から■4点を自動検出（ガイド枠不要）
        const detected = detectAlignmentMarks(ctx, canvas.width, canvas.height);

        if (detected) {
          // ② 履歴に追加（最大 HISTORY_LEN フレーム保持）
          historyRef.current.push(detected);
          if (historyRef.current.length > HISTORY_LEN) historyRef.current.shift();

          // ③ 各コーナーの中央値で手ブレを平滑化
          const smoothed: Point[] = [0, 1, 2, 3].map(i => {
            const xs = historyRef.current.map(h => h[i].x).sort((a, b) => a - b);
            const ys = historyRef.current.map(h => h[i].y).sort((a, b) => a - b);
            const mid = Math.floor(xs.length / 2);
            return { x: xs[mid], y: ys[mid] };
          });

          // ④ 検出枠を緑で描画（デバッグ表示）
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#10b981";
          ctx.beginPath();
          ctx.moveTo(smoothed[0].x, smoothed[0].y);
          for (let i = 1; i < 4; i++) ctx.lineTo(smoothed[i].x, smoothed[i].y);
          ctx.closePath();
          ctx.stroke();

          smoothed.forEach(p => {
            ctx.fillStyle = "#10b981";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            ctx.fill();
          });

          // ⑤ 履歴が HISTORY_LEN フレーム貯まったら解析（ブレていても中央値で安定）
          if (historyRef.current.length >= HISTORY_LEN) {
            const res = parseSheet(ctx, smoothed, stocks);
            const isValidId = /^\d{4}$/.test(res.shortId);

            if (isValidId && res.stockId && res.type) {
              active = false;
              setIsScanning(false);
              setParsedData(res);
              void lookupUser(res.shortId);
            }
          }
        } else {
          // 検出できなかった場合は赤いガイド枠を表示
          const mx = canvas.width / 2;
          const my = canvas.height / 2;
          const gw = canvas.width * 0.6;
          const gh = gw * (210 / 297); // A4横比率
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ef4444";
          ctx.setLineDash([12, 6]);
          ctx.strokeRect(mx - gw / 2, my - gh / 2, gw, gh);
          ctx.setLineDash([]);

          // 検出失敗が続いたら履歴をリセット
          historyRef.current = [];
        }
      }

      if (active) requestAnimationFrame(scanLoop);
    };

    requestAnimationFrame(scanLoop);
    return () => { active = false; };
  }, [stream, isScanning, lookupUser, stocks]);

  const handleConfirm = async () => {
    if (!parsedData || !matchedUser) return;
    if (!parsedData.isMax && (!Number.isFinite(parsedData.amount) || parsedData.amount <= 0)) {
      setErrorMessage("株数が読み取れませんでした。用紙を確認してください。");
      setTradeStatus("ERROR");
      return;
    }
    setTradeStatus("PROCESSING");
    try {
      const result = await executeTerminalTrade(
        matchedUser.uid,
        parsedData.stockId!,
        parsedData.type!,
        parsedData.amount
      );
      if (result.success) {
        setTradeStatus("SUCCESS");
      } else {
        setErrorMessage(result.errorMsg || "取引に失敗しました。");
        setTradeStatus("ERROR");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMessage(msg);
      setTradeStatus("ERROR");
    }
  };

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-red-500 p-8">
        <AlertTriangle size={48} />
        <p className="font-bold text-center">{cameraError}</p>
        <Button variant="secondary" onClick={onReturnPortal}><ArrowLeft size={16} /> 戻る</Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden flex flex-col">
      {/* カメラ映像（非表示、canvasに描画） */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* キャンバス（カメラ映像 + オーバーレイ描画） */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* UIオーバーレイ */}
      <div className="relative z-10 flex flex-col h-full pointer-events-none">

        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 pointer-events-auto">
          <button
            onClick={onReturnPortal}
            className="bg-black/60 text-white p-2 rounded-full border border-white/20 hover:bg-black/80"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-black tracking-widest uppercase bg-slate-900/80 px-6 py-2.5 rounded-full border border-slate-700 flex items-center gap-2 text-white">
            <ScanLine className="text-purple-500 animate-pulse" /> マークシート受付
          </h2>
          <div className="w-10" />
        </div>

        {/* スキャン中のガイドメッセージ */}
        {isScanning && (
          <div className="flex-1 flex flex-col items-center justify-end pb-16 gap-3">
            <p className="text-base font-black text-emerald-400 animate-pulse tracking-wider bg-black/60 px-4 py-2 rounded-full">
              マークシート読み取り待機中...
            </p>
            <p className="text-xs text-slate-400 bg-black/50 px-3 py-1 rounded-full">
              用紙の四隅の■がカメラに映るように向けてください
            </p>
          </div>
        )}

        {/* 読み取り結果パネル */}
        {!isScanning && parsedData && (
          <div className="flex-1 flex items-center justify-center pointer-events-auto px-4">
            <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              {tradeStatus === "CONFIRMING" && matchedUser && (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="text-emerald-400" size={20} />
                    <h3 className="font-black text-white text-lg">読み取り完了</h3>
                  </div>
                  <div className="space-y-2 mb-6 text-sm">
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-500">エージェント</span>
                      <span className="font-bold">{matchedUser.nickname}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-500">操作</span>
                      <Badge variant={parsedData.type === "BUY" ? "success" : "danger"}>
                        {parsedData.type === "BUY" ? "購入 (BUY)" : "売却 (SELL)"}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-500">銘柄ID</span>
                      <span className="font-mono font-bold">{parsedData.stockId}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-500">株数</span>
                      <span className="font-bold">{parsedData.isMax ? "全財産 (MAX)" : `${parsedData.amount} 株`}</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={handleReset} className="flex-1">
                      <RefreshCw size={14} /> やり直す
                    </Button>
                    <Button onClick={handleConfirm} disabled={!parsedData.isMax && parsedData.amount <= 0} className="flex-1 bg-emerald-600 hover:bg-emerald-500">
                      確定する
                    </Button>
                  </div>
                </>
              )}

              {tradeStatus === "PROCESSING" && (
                <div className="text-center py-4">
                  <p className="text-white font-bold animate-pulse">処理中...</p>
                </div>
              )}

              {tradeStatus === "SUCCESS" && (
                <div className="text-center py-4 space-y-3">
                  <CheckCircle className="text-emerald-400 mx-auto" size={40} />
                  <p className="text-white font-black text-lg">取引完了</p>
                  <Button onClick={handleReset} className="w-full">次の読み取りへ</Button>
                </div>
              )}

              {tradeStatus === "ERROR" && (
                <div className="text-center py-4 space-y-3">
                  <AlertTriangle className="text-red-400 mx-auto" size={40} />
                  <p className="text-red-400 font-bold text-sm">{errorMessage}</p>
                  <Button variant="secondary" onClick={handleReset} className="w-full">
                    <RefreshCw size={14} /> やり直す
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
