export type DiagnosticStage =
  | "login-token"
  | "login-auth"
  | "login-ready"
  | "session-restore"
  | "qr-start"
  | "qr-scan"
  | "qr-stop"
  | "trade-submit"
  | "trade-confirm";

const getDisplayMode = () => {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "standalone";
  return "browser";
};

const getErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

export const createOperationId = (prefix: string) => {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
};

export const recordClientDiagnostic = (
  operationId: string,
  stage: DiagnosticStage,
  startedAt: number,
  outcome: "success" | "error" | "paused",
  error?: unknown,
) => {
  const entry = {
    operationId,
    stage,
    outcome,
    durationMs: Math.round(performance.now() - startedAt),
    online: navigator.onLine,
    displayMode: getDisplayMode(),
    platform: navigator.platform,
    errorCode: getErrorCode(error),
  };
  console.info("[client-diagnostic]", entry);
  try {
    const key = "insider_client_diagnostics";
    const previous = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    const entries = Array.isArray(previous) ? previous.slice(-99) : [];
    localStorage.setItem(key, JSON.stringify([...entries, { ...entry, recordedAt: new Date().toISOString() }]));
  } catch {
    // Private BrowsingなどでlocalStorageが使えなくても本処理は継続する。
  }
};

export const firebaseErrorCode = getErrorCode;
