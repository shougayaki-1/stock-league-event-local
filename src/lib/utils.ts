import type { PrizeGrade, User } from "../types/domain";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { compareExact, type ExactNumberInput } from "./exactNumber";

// NGワードの簡易フィルター
const NG_WORDS = ["バカ", "アホ", "死ね", "殺す", "うんこ", "ちんこ", "まんこ"];

export const filterNickname = (name: string): string => {
  let isValid = true;
  NG_WORDS.forEach(word => {
    if (name.includes(word)) isValid = false;
  });
  return isValid ? name : `エージェント${Math.floor(Math.random() * 1000)}`;
};

// 景品グレードの判定ロジック（Firestoreの設定配列を受け取る）
export const getPrizeGrade = (points: ExactNumberInput, grades: PrizeGrade[]) => {
  if (!grades || grades.length === 0) return { grade: "不明", desc: "設定されていません" };
  
  // 閾値の高い順にソートして判定
  const sorted = [...grades].sort((a, b) => compareExact(b.threshold, a.threshold));
  for (const g of sorted) {
    if (compareExact(points, g.threshold) >= 0) return { grade: g.id, desc: g.desc };
  }
  
  // 最下位のものを返す
  return { grade: sorted[sorted.length - 1].id, desc: sorted[sorted.length - 1].desc };
};

// Tailwindのクラス名を結合・競合解消するユーティリティ
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const USER_ID_PARAM_RE = /[?&]user[iI][dD]=([^&#]+)/;
const SHORT_ID_RE = /^\d{4}$/;

export const extractUserIdPayload = (text: string) => {
  const cleanText = text.trim();
  const match = cleanText.match(USER_ID_PARAM_RE);
  const rawId = match?.[1] ?? cleanText;

  try {
    return decodeURIComponent(rawId).trim();
  } catch {
    return rawId.trim();
  }
};

export const extractShortIdFromQr = (text: string) => {
  const userId = extractUserIdPayload(text);
  const shortId = userId.split("-")[0];
  return SHORT_ID_RE.test(shortId) ? shortId : null;
};

export const buildLoginQrUrl = (userId: string, origin = window.location.origin) => {
  const cleanOrigin = origin.replace(/\/$/, "");
  return `${cleanOrigin}/login?userID=${encodeURIComponent(userId)}`;
};

export const getLoginId = (user: Pick<User, "uid" | "email">) => user.email ? user.email.split("@")[0] : user.uid;
