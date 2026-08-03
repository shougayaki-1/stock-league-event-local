import { useCallback, useEffect, useState } from "react";
import { callGetServerTime } from "../services/functions";

export async function getEstimatedServerTimeMillis(): Promise<number> {
  try {
    const startedAt = Date.now();
    const result = await callGetServerTime();
    const endedAt = Date.now();
    const roundTripOffset = Math.floor((endedAt - startedAt) / 2);
    return result.data.serverTimeMillis + roundTripOffset;
  } catch (error) {
    console.warn("Failed to fetch server time; falling back to client clock.", error);
    return Date.now();
  }
}

// 同じタブ内の複数フックが個別にgetServerTimeを叩かないよう、同期処理と結果を共有する。
let sharedOffsetMillis = 0;
let sharedSyncIntervalId: number | null = null;
const sharedOffsetSubscribers = new Set<(offset: number) => void>();

const subscribeServerClock = (listener: (offset: number) => void) => {
  sharedOffsetSubscribers.add(listener);
  listener(sharedOffsetMillis);

  if (!sharedSyncIntervalId) {
    const sync = async () => {
      const serverNow = await getEstimatedServerTimeMillis();
      sharedOffsetMillis = serverNow - Date.now();
      sharedOffsetSubscribers.forEach((subscriber) => subscriber(sharedOffsetMillis));
    };
    void sync();
    sharedSyncIntervalId = window.setInterval(sync, 60_000);
  }

  return () => {
    sharedOffsetSubscribers.delete(listener);
    if (sharedOffsetSubscribers.size === 0 && sharedSyncIntervalId !== null) {
      window.clearInterval(sharedSyncIntervalId);
      sharedSyncIntervalId = null;
    }
  };
};

export function useServerClock() {
  const [serverTimeOffsetMillis, setServerTimeOffsetMillis] = useState(sharedOffsetMillis);

  useEffect(() => subscribeServerClock(setServerTimeOffsetMillis), []);

  const getServerNowMillis = useCallback(() => Date.now() + serverTimeOffsetMillis, [serverTimeOffsetMillis]);

  return { serverTimeOffsetMillis, getServerNowMillis };
}
