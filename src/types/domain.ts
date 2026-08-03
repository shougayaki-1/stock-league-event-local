import type { Timestamp } from "firebase/firestore";
import type { ExactNumberInput } from "../lib/exactNumber";

export interface User {
  uid: string;
  shortId: string;
  nickname: string;
  points: ExactNumberInput;
  inventory: Record<string, ExactNumberInput>;
  /** ランキング集計時点の現金と保有株評価額の合計。 */
  totalAssets?: ExactNumberInput;
  courseType: string;
  isFinished: boolean;
  isTicketUsed?: boolean;
  isInClass?: boolean;
  checkedInAt?: Timestamp;
  checkedOutAt?: Timestamp | null;
  lastAttendanceAction?: "CHECK_IN" | "CHECK_OUT" | "PHASE_CHECK_OUT";
  email?: string;
  password?: string;
}

export interface Stock {
  id: string;
  name: string;
  currentPrice: number;
  basePrice?: number;
  targetPrice?: number;
  fluctuationPercent?: number;
}

export interface Transaction {
  type: "BUY" | "SELL";
  stockId: string;
  price: number;
  amount: ExactNumberInput;
  totalPoint: ExactNumberInput;
  timestamp: Timestamp;
  isUndone?: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  stockId: string | null;
  target: "ALL" | "INSIDER";
  kind?: "PUBLIC" | "POST";
  timestamp: Timestamp;
}

export interface ChartData {
  time: string;
  [key: string]: string | number;
}

export interface PrizeGrade {
  id: string;
  threshold: ExactNumberInput;
  desc: string;
}

export interface SystemStatus {
  globalPhase: "STOP" | "RUNNING" | "EMERGENCY";
  initialPoint: ExactNumberInput;
  activeBreakingNews: { videoId: string; timestamp: number } | null;
  emergencyState?: {
    isActive: boolean;
    type?: "UP" | "DOWN";
    message?: string;
    overlayExecuteAt?: Timestamp;
    priceExecuteAt?: Timestamp;
  };
  showInfoPageOnLogin?: boolean;
  infoPageMarkdown?: string;
  scenarioMode?: "AUTO" | "MANUAL";
  emergencyMessage?: string;
  emergencyType?: "UP" | "DOWN";
  clientVersion?: string;
  /** 取引画面・証券窓口で共通表示する数量入力ボタン。 */
  tradeQuantityPresets?: string[];
  /** 新価格見積もりを持たない旧クライアント注文を拒否する段階移行フラグ。 */
  tradeQuoteRequired?: boolean;
}

export interface SignageState {
  id: string;
  name: string;
  mode: string;
  timerEndTime?: Timestamp;
}

export interface PriceChangeBranch {
  label?: string;
  probability: number;
  changePercent?: number;
  deadlineMinutes?: number;
  targetPrice?: number;
  fluctuationPercent?: number;
  postNewsPresetId?: string | null;
  postNewsDelaySeconds?: number | null;
  /** @deprecated Legacy free-text news retained only for old persisted data. */
  postNews?: {
    title: string;
    body: string;
    delaySeconds?: number;
  } | null;
}

export interface PriceChangeTarget {
  stockId: string;
  branches: PriceChangeBranch[];
}
