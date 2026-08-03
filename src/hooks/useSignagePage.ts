import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useStocks, useAllUsersRanking, useChartHistory, useNews, useSignageState } from "./useFirebase";

export function useSignagePage() {
  const [searchParams] = useSearchParams();
  const signageId = searchParams.get("id");
  const state = useSignageState(signageId);

  const stocks = useStocks();
  const ranking = useAllUsersRanking();
  const chartData = useChartHistory();
  const news = useNews();
  const [currentTime, setCurrentTime] = useState(new Date());

  const [riddleStep, setRiddleStep] = useState<"STANDBY" | "OP" | "TIMER" | "ED">("STANDBY");
  const [opFileUrl, setOpFileUrl] = useState<string | null>(null);
  const [edFileUrl, setEdFileUrl] = useState<string | null>(null);
  const [localTimerEnd, setLocalTimerEnd] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "OP" | "ED") => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      // ★修正: setOpUrl ではなく setOpFileUrl
      if (type === "OP") setOpFileUrl(url);
      else setEdFileUrl(url);
    }
  };

  const startLocalTimer = (minutes: number) => {
    const end = new Date(Date.now() + minutes * 60000);
    setLocalTimerEnd(end);
    setRiddleStep("TIMER");
  };

  return {
    signageId, state,
    stocks, ranking, chartData, news, currentTime,
    riddleStep, setRiddleStep, opFileUrl, edFileUrl, localTimerEnd,
    handleFileSelect, startLocalTimer
  };
}