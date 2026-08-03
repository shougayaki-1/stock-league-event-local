// src/components/signage/riddle/SignageTimer.tsx

interface SignageTimerProps {
  timeLeft: number | null;
  timerState: "STOPPED" | "RUNNING" | "PAUSED";
  roomName: string;
}

export default function SignageTimer({ timeLeft, timerState, roomName }: SignageTimerProps) {
  if (timeLeft === null) return null;
  
  const m = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const s = (timeLeft % 60).toString().padStart(2, "0");
  const isPaused = timerState === "PAUSED";
  const isDanger = timeLeft <= 60 && !isPaused;

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center bg-white dark:bg-black p-8 font-mono border-[20px] border-slate-900 transition-colors">
      <p className="mb-5 max-w-full truncate rounded-full border border-slate-300 bg-slate-100 px-6 py-2 text-center font-sans text-2xl font-black text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:text-4xl">
        {roomName || "謎解きルーム"}
      </p>
      <p className={`text-4xl md:text-5xl font-bold tracking-[0.4em] uppercase mb-12 ${
        isPaused ? 'text-slate-400 dark:text-slate-600' : isDanger ? 'text-rose-600 dark:text-rose-500 animate-pulse' : 'text-purple-600 dark:text-purple-400'
      }`}>
        {isPaused ? "PAUSED" : "Time Remaining"}
      </p>

      <div
        className={`font-black tracking-tighter transition-colors duration-500 ${
          isPaused
            ? 'text-slate-300 dark:text-slate-700'
            : isDanger
              ? 'text-rose-600 dark:text-rose-500 drop-shadow-[0_0_30px_rgba(225,29,72,0.3)] animate-pulse'
              : 'text-slate-800 dark:text-white drop-shadow-[0_0_20px_rgba(168,85,247,0.2)]'
        }`}
        style={{ fontSize: 'clamp(8rem, 25vw, 35rem)' }}
      >
        {m}:{s}
      </div>

      <div className="h-24 mt-10 md:mt-16 flex items-center justify-center">
        {isDanger && timeLeft > 0 && (
          <p className="text-rose-600 dark:text-rose-500 text-4xl md:text-6xl font-black animate-bounce uppercase tracking-widest text-center">
            Hurry Up!
          </p>
        )}
      </div>
    </div>
  );
}
