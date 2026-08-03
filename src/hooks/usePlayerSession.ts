import { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { createOperationId, recordClientDiagnostic } from "../lib/clientDiagnostics";
import { ensurePlayerSession, waitForInitialAuthState } from "../lib/playerSession";
import { decidePlayerSession } from "../lib/playerSessionDecision";

export type PlayerSessionState =
  | { status: "missing" | "initializing" | "restoring"; uid: null; error: null }
  | { status: "authenticated"; uid: string; error: null }
  | { status: "error"; uid: null; error: unknown };

export function usePlayerSession(requestedId: string | null): PlayerSessionState {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<PlayerSessionState>(() => requestedId
    ? { status: "initializing", uid: null, error: null }
    : { status: "missing", uid: null, error: null });

  useEffect(() => {
    const resume = () => setRevision((value) => value + 1);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    return () => {
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
    };
  }, []);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    return auth.onAuthStateChanged((user) => {
      if (user?.uid !== state.uid) setRevision((value) => value + 1);
    });
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    if (!requestedId) {
      const timer = window.setTimeout(() => setState({ status: "missing", uid: null, error: null }), 0);
      return () => window.clearTimeout(timer);
    }

    const normalizedId = requestedId.trim().toLowerCase();
    const operationId = createOperationId("session");
    const startedAt = performance.now();

    void (async () => {
      try {
        await waitForInitialAuthState();
        if (cancelled) return;
        const decision = decidePlayerSession(normalizedId, auth.currentUser?.uid ?? null);
        if (decision.action === "authenticated") {
          setState({ status: "authenticated", uid: normalizedId, error: null });
          recordClientDiagnostic(operationId, "session-restore", startedAt, "success");
          return;
        }

        setState({ status: "restoring", uid: null, error: null });
        const uid = await ensurePlayerSession(normalizedId);
        if (cancelled) return;
        setState({ status: "authenticated", uid, error: null });
        recordClientDiagnostic(operationId, "session-restore", startedAt, "success");
      } catch (error) {
        if (cancelled) return;
        setState({ status: "error", uid: null, error });
        recordClientDiagnostic(operationId, "session-restore", startedAt, "error", error);
      }
    })();

    return () => { cancelled = true; };
  }, [requestedId, revision]);

  return state;
}
