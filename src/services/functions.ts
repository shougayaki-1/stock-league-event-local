import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

export interface TradeStockRequest {
  uid: string;
  stockId: string;
  type: "BUY" | "SELL";
  amount: string;
  idempotencyKey: string;
  /** サーバーが発行した5秒間有効な価格見積もりID。 */
  quoteId: string;
  /** 全額（買い）／全株（売り）をサーバー側の約定価格で確定する。true の場合 amount は無視される。 */
  maxMode?: boolean;
}

export interface StockPriceQuoteRequest {
  uid: string;
  stockId: string;
}

export interface StockPriceQuoteResponse {
  quoteId: string;
  price: number;
  issuedAtMillis: number;
  expiresAtMillis: number;
}

export interface TradeStockResponse {
  success: boolean;
  transactionId: string;
  cached?: boolean;
  /** サーバーが確定した約定内容。MAX注文ではクライアント表示の見積もりには使わない。 */
  amount: string;
  price: number;
  totalPoint: string;
  remainingPoints: string;
  warning?: string;
}

export interface UidRequest {
  uid: string;
}

export interface SuccessResponse {
  success: boolean;
}

export interface ServerTimeResponse {
  serverTimeMillis: number;
}

export type TriggerScenarioPart = "ALL" | "MAIN" | "POST_NEWS";

export const callTradeStock = httpsCallable<TradeStockRequest, TradeStockResponse>(functions, "tradeStock");
export const callQuoteStockPrice = httpsCallable<StockPriceQuoteRequest, StockPriceQuoteResponse>(functions, "quoteStockPrice");
export const callFinalizeAccount = httpsCallable<UidRequest, SuccessResponse>(functions, "finalizeAccount");
export const callUndoFinalizeAccount = httpsCallable<UidRequest, SuccessResponse>(functions, "undoFinalizeAccount");
export const callMarkTicketUsed = httpsCallable<UidRequest, SuccessResponse>(functions, "markTicketUsed");
export const callUpdateAgentNickname = httpsCallable<{ uid: string; newNickname: string }, SuccessResponse>(functions, "updateAgentNickname");
export const callUndoTransaction = httpsCallable<{ uid: string; transactionId: string }, SuccessResponse>(functions, "undoTransaction");
export const callTriggerScenarioEvent = httpsCallable<{ eventId: string; part?: TriggerScenarioPart }, SuccessResponse>(functions, "triggerScenarioEvent");
export const callGetServerTime = httpsCallable<void, ServerTimeResponse>(functions, "getServerTime");
