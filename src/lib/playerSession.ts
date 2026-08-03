import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";
import { beginCriticalOperation } from "./criticalOperation";
import { createOperationId, recordClientDiagnostic } from "./clientDiagnostics";

interface LoginResponse {
  success: boolean;
  customToken: string;
  uid: string;
}

const LOGIN_TIMEOUT_MS = 12_000;
let inFlightSession: { id: string; promise: Promise<string> } | null = null;

const withTimeout = async <T,>(promise: Promise<T>, message: string): Promise<T> => {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), LOGIN_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const waitForUid = (uid: string) => new Promise<string>((resolve, reject) => {
  let unsubscribe = () => {};
  const timeoutId = window.setTimeout(() => {
    unsubscribe();
    reject(new Error("認証状態の確認がタイムアウトしました。"));
  }, LOGIN_TIMEOUT_MS);
  unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!user) return;
    window.clearTimeout(timeoutId);
    unsubscribe();
    if (user.uid === uid) resolve(uid);
    else reject(new Error("別のユーザーとして認証されています。"));
  }, (error) => {
    window.clearTimeout(timeoutId);
    unsubscribe();
    reject(error);
  });
});

const runAuthentication = async (id: string) => {
  const releaseCritical = beginCriticalOperation();
  const operationId = createOperationId("login");
  try {
    if (auth.currentUser?.uid === id) return id;
    if (auth.currentUser && auth.currentUser.uid !== id) await signOut(auth);

    const tokenStartedAt = performance.now();
    const login = httpsCallable<{ shortIdAndSuffix: string }, LoginResponse>(functions, "loginByShortId");
    let response;
    try {
      response = await withTimeout(login({ shortIdAndSuffix: id }), "認証サーバーへの接続がタイムアウトしました。");
      recordClientDiagnostic(operationId, "login-token", tokenStartedAt, "success");
    } catch (error) {
      recordClientDiagnostic(operationId, "login-token", tokenStartedAt, "error", error);
      throw error;
    }

    if (!response.data.success || !response.data.customToken || response.data.uid !== id) {
      throw new Error("認証トークンが正しくありません。");
    }

    const authStartedAt = performance.now();
    try {
      await withTimeout(signInWithCustomToken(auth, response.data.customToken), "端末へのログイン保存がタイムアウトしました。");
      await waitForUid(id);
      recordClientDiagnostic(operationId, "login-auth", authStartedAt, "success");
      return id;
    } catch (error) {
      recordClientDiagnostic(operationId, "login-auth", authStartedAt, "error", error);
      throw error;
    }
  } finally {
    releaseCritical();
  }
};

export const ensurePlayerSession = (rawId: string) => {
  const id = rawId.trim().toLowerCase();
  if (!id) return Promise.reject(new Error("IDを入力してください。"));
  if (inFlightSession?.id === id) return inFlightSession.promise;

  const promise = runAuthentication(id).finally(() => {
    if (inFlightSession?.promise === promise) inFlightSession = null;
  });
  inFlightSession = { id, promise };
  return promise;
};

// A stale browser persistence record must not leave the player screen waiting
// forever when switching to a fresh local Emulator dataset.
export const waitForInitialAuthState = () =>
  withTimeout(auth.authStateReady(), "認証状態の復元がタイムアウトしました。");
