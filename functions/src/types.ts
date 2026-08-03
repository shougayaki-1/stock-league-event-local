// functions/src/types.ts

import { Timestamp } from "firebase-admin/firestore";

export interface StockData {
  id: string;
  name: string;
  currentPrice: number;
  basePrice?: number;
  targetPrice?: number | null;
  fluctuationPercent?: number;
  targetPriceExecuteAt?: Timestamp | null;
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
  postNews?: NewsPayload | null;
}

export interface PriceChangeTarget {
  stockId: string;
  branches: PriceChangeBranch[];
}

export type StockPriceDirection = "UP" | "DOWN" | "FLAT";

export interface StockPricePhase {
  id: string;
  startMinute: number;
  endMinute: number;
  direction: StockPriceDirection;
  changePercent: number;
}

export interface StockPriceConfig {
  phases: StockPricePhase[];
}

export type PriceRuntimeMode = "PHASE" | "SCENARIO";

export interface PriceRuntimeState {
  mode: PriceRuntimeMode;
  phaseId?: string | null;
  startPrice: number;
  endPrice: number;
  startAt: Timestamp;
  endAt: Timestamp;
  seed: number;
  fluctuationPercent?: number;
}

export interface PriceEngineData {
  configs?: Record<string, StockPriceConfig>;
  runtime?: Record<string, PriceRuntimeState | null>;
}

export interface NewsPayload {
  title: string;
  body?: string;
  delaySeconds?: number;
}

export type NewsKind = "PUBLIC" | "POST";

export interface ScenarioProcessedParts {
  main?: boolean;
  postNews?: boolean;
}

export interface ScenarioSelectedBranch {
  stockId: string;
  priceChangeIndex: number;
  branchIndex: number;
  branchLabel?: string;
}

export interface ScenarioSignageAction {
  signageId: string;
  mode: string;
  duration: number;
  videoAssetId?: string | null;
  kind: "NORMAL" | "AD";
}

export interface NewsPresetSignageDisplay {
  mode: string;
  duration: number;
  videoAssetId?: string | null;
  kind: "NORMAL" | "AD";
}

export interface SignageManualOverride {
  mode: string;
  videoAssetId?: string | null;
  kind?: "NORMAL" | "AD";
  startedAt?: Timestamp | null;
}

export interface LoopScenarioItem {
  offsetSeconds?: number;
  publicNewsPresetId?: string | null;
  postNewsPresetId?: string | null;
  postNewsDelaySeconds?: number | null;
  insiderNewsPresetId?: string | null;
  publicNews?: NewsPayload | null;
  postNews?: NewsPayload | null;
  insiderNews?: NewsPayload | null;
  priceChanges?: PriceChangeTarget[] | null;
  signageTargetId?: string | null;
  /** @deprecated Use public news preset breakingVideoId instead. */
  breakingVideoId?: string | null;
  /** @deprecated Use public news preset signageDisplay plus signageTargetId instead. */
  signageAction?: ScenarioSignageAction | null;
}

export interface NewsPresetData {
  name?: string;
  title: string;
  body?: string;
  breakingVideoId?: string | null;
  signageDisplay?: NewsPresetSignageDisplay | null;
}

export interface PhaseSchedule {
  time: Timestamp;
  targetPhase: "STOP" | "RUNNING" | "EMERGENCY";
}

export interface UserData {
  uid: string;
  shortId: string;
  email?: string;
  nickname: string;
  points: string | number;
  inventory: Record<string, string | number>;
  courseType: "TRADER" | "INSIDER";
  isFinished: boolean;
  createdAt: Timestamp;
}

export interface SystemSettingsData {
  globalPhase?: "STOP" | "RUNNING" | "EMERGENCY";
  initialPoint?: string | number;
  initialHoldings?: Record<string, string>;
  showInfoPageOnLogin?: boolean;
  scenarioMode?: "AUTO" | "MANUAL";
  // 家庭用の省Firestoreモード。ON の間はランキング集計・tick を大幅に間引き、
  // 10秒ごとの値動き（クライアント補間）だけを維持する。
  ecoMode?: boolean;
  slippageTolerance?: number;
  tradeQuoteRequired?: boolean;
  tradeQuantityPresets?: string[];
  loopEnabled?: boolean;
  loopIntervalMinutes?: number;
  loopScenario?: LoopScenarioItem[];
  schedules?: PhaseSchedule[];
  lastTickAt?: Timestamp | null;
  emergencyState?: {
    isActive: boolean;
    type: "UP" | "DOWN";
    message: string;
    overlayExecuteAt?: Timestamp | null;
    priceExecuteAt?: Timestamp | null;
    // 価格を一度だけ動かすための処理済み時刻。オーバーレイの表示状態とは分離する。
    priceAppliedAt?: Timestamp | null;
  };
}
