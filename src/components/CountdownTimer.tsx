import { useState, useEffect } from "react";
import { Timestamp } from "firebase/firestore";

interface Props {
  endTime?: Timestamp;
}

export default function CountdownTimer({ endTime }: Props) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!endTime) return;
    
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = endTime.toDate().getTime();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(diff);
      
      if (diff === 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  if (!endTime) return null;

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const seconds = (timeLeft % 60).toString().padStart(2, "0");
  const isDanger = timeLeft <= 60;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-3xl text-purple-400 font-bold mb-8 tracking-[0.5em] uppercase">Time Remaining</p>
      {/* ★ 変更：text-whiteを text-slate-800 dark:text-white にしてライトモードに対応 */}
      <div className={`font-mono text-[15rem] leading-none font-black tracking-tight ${isDanger ? 'text-red-500 animate-pulse' : 'text-slate-800 dark:text-white'}`}>
        {minutes}:{seconds}
      </div>
      {isDanger && timeLeft > 0 && <p className="text-red-500 text-2xl font-bold mt-8 animate-bounce">HURRY UP!</p>}
      {timeLeft === 0 && <p className="text-red-500 text-5xl font-black mt-8">TIME OVER</p>}
    </div>
  );
}