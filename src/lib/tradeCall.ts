import type { HttpsCallableResult } from "firebase/functions";
import { callTradeStock, type TradeStockRequest, type TradeStockResponse } from "../services/functions";
import { beginCriticalOperation } from "./criticalOperation";
import { createOperationId, firebaseErrorCode, recordClientDiagnostic } from "./clientDiagnostics";

const FIRST_ATTEMPT_TIMEOUT_MS = 15_000;
const CONFIRMATION_TIMEOUT_MS = 25_000;

class TradeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeTimeoutError";
  }
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string) => {
  let timeoutId: number | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new TradeTimeoutError(message)), ms);
    }),
  ]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  });
};

const shouldConfirm = (error: unknown) => {
  const code = firebaseErrorCode(error);
  return error instanceof TradeTimeoutError || !navigator.onLine ||
    code === "functions/unavailable" || code === "functions/deadline-exceeded" || code === "functions/internal";
};

export async function callTradeWithConfirmation(
  request: TradeStockRequest,
): Promise<HttpsCallableResult<TradeStockResponse>> {
  const releaseCritical = beginCriticalOperation();
  const operationId = request.idempotencyKey || createOperationId("trade");
  const startedAt = performance.now();
  try {
    try {
      const result = await withTimeout(
        callTradeStock(request),
        FIRST_ATTEMPT_TIMEOUT_MS,
        "取引結果を確認しています。画面を閉じずにお待ちください。",
      );
      recordClientDiagnostic(operationId, "trade-submit", startedAt, "success");
      return result;
    } catch (error) {
      recordClientDiagnostic(operationId, "trade-submit", startedAt, "error", error);
      if (!shouldConfirm(error)) throw error;
    }

    const confirmationStartedAt = performance.now();
    try {
      const result = await withTimeout(
        callTradeStock(request),
        CONFIRMATION_TIMEOUT_MS,
        "取引結果を確認できませんでした。取引履歴を確認してください。",
      );
      recordClientDiagnostic(operationId, "trade-confirm", confirmationStartedAt, "success");
      return result;
    } catch (error) {
      recordClientDiagnostic(operationId, "trade-confirm", confirmationStartedAt, "error", error);
      throw error;
    }
  } finally {
    releaseCritical();
  }
}

export const isUncertainTradeError = (error: unknown) => error instanceof TradeTimeoutError || shouldConfirm(error);
