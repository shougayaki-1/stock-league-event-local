// =================================================================
// File: src/hooks/useLoginPage.ts
// =================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDialog } from "../contexts/DialogContext";
import { useSound } from "./useSound";
import { STORAGE_KEYS } from "../lib/storageKeys";
import { ensurePlayerSession } from "../lib/playerSession";
import { firebaseErrorCode } from "../lib/clientDiagnostics";

const getLoginErrorMessage = (error: unknown) => {
  const code = firebaseErrorCode(error);
  if (!navigator.onLine || code === "functions/unavailable" || code === "auth/network-request-failed") {
    return "通信できません。Wi-Fiを確認してから、もう一度お試しください。";
  }
  if (code === "functions/not-found") return "IDが見つかりません。QRコードまたは入力内容を確認してください。";
  if (code?.startsWith("auth/")) return "端末へのログイン保存に失敗しました。Safariの設定を確認してください。";
  return error instanceof Error ? error.message : "ログインに失敗しました。";
};

export function useLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { alert } = useDialog();
  const { playSound, initAudioContext } = useSound();

  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loginMode, setLoginMode] = useState<"choice" | "manual" | "qr">("choice");
  const [inputID, setInputID] = useState("");
  const loginInFlightRef = useRef(false);

  const navigateAfterLogin = useCallback(async () => {
    const destination = searchParams.get("tab") === "help" ? "/?tab=help" : "/";

    try {
      const snap = await getDoc(doc(db, "settings", "system"));
      const showInfoPageOnLogin = snap.exists() ? snap.data().showInfoPageOnLogin !== false : true;
      navigate(showInfoPageOnLogin ? "/?tab=help" : destination, { replace: true });
    } catch {
      navigate("/?tab=help", { replace: true });
    }
  }, [navigate, searchParams]);

  const processLogin = useCallback(async (rawId: string) => {
    if (loginInFlightRef.current) return;
    loginInFlightRef.current = true;
    initAudioContext();
    setLoading(true);

    // 空白をトリミングし、小文字に統一
    const id = rawId.trim().toLowerCase();

    try {
      await ensurePlayerSession(id);
      playSound("NEWS_ALERT");
      localStorage.setItem(STORAGE_KEYS.USER_ID, id);
      await navigateAfterLogin();
    } catch (err) {
      console.error(err);
      await alert({ title: "ログインエラー", message: getLoginErrorMessage(err), variant: "danger" });
      setLoading(false);
      setIsInitializing(false);
    } finally {
      loginInFlightRef.current = false;
    }
  }, [alert, playSound, initAudioContext, navigateAfterLogin]);

  const hasAttemptedLogin = useRef(false);

  useEffect(() => {
    const paramID = searchParams.get("userID");
    const requestedMode = searchParams.get("mode");
    const cameFromInfo = searchParams.get("from") === "info";
    const storedID = localStorage.getItem(STORAGE_KEYS.USER_ID);

    const timer = setTimeout(() => {
      if (paramID && !hasAttemptedLogin.current) {
        hasAttemptedLogin.current = true;
        processLogin(paramID);
      } else if (cameFromInfo) {
        // 旧 /info リンクからは、既存ログイン状態に左右されずログイン方法を選び直せるようにする。
        setLoginMode("choice");
        setIsInitializing(false);
      } else if (requestedMode === "manual" || requestedMode === "qr") {
        setLoginMode(requestedMode);
        setIsInitializing(false);
      } else if (storedID && !paramID && !hasAttemptedLogin.current) {
        hasAttemptedLogin.current = true;
        processLogin(storedID);
      } else {
        setIsInitializing(false);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [navigateAfterLogin, searchParams, processLogin]);

  return {
    isInitializing, loading, loginMode, setLoginMode,
    inputID, setInputID,
    processLogin
  };
}
