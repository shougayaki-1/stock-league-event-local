import { useEffect, useRef, useState } from "react";
import type { SystemStatus } from "../../types/domain";

const EMERGENCY_OVERLAY_DURATION_MS = 4000;

export function useEmergencyOverlay(systemSettings: SystemStatus | null) {
  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);
  const [showEmergencyResolvedOverlay, setShowEmergencyResolvedOverlay] = useState(false);
  const [emergencyConfig, setEmergencyConfig] = useState<{ type: "UP" | "DOWN", message: string } | null>(null);
  const lastEmergencyAtRef = useRef<number>(0);
  const previousEmergencyActiveRef = useRef(false);
  const emergencyStartTimerRef = useRef<number | null>(null);
  const emergencyHideTimerRef = useRef<number | null>(null);
  const emergencyResolvedTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    [emergencyStartTimerRef, emergencyHideTimerRef, emergencyResolvedTimerRef, resetTimerRef].forEach((ref) => {
      if (ref.current !== null) window.clearTimeout(ref.current);
    });
  }, []);

  useEffect(() => {
    const emg = systemSettings?.emergencyState;
    const wasEmergencyActive = previousEmergencyActiveRef.current;
    const isEmergencyActive = Boolean(emg?.isActive);
    if (wasEmergencyActive && !isEmergencyActive) {
      setShowEmergencyResolvedOverlay(true);
      if (emergencyResolvedTimerRef.current !== null) window.clearTimeout(emergencyResolvedTimerRef.current);
      emergencyResolvedTimerRef.current = window.setTimeout(() => setShowEmergencyResolvedOverlay(false), EMERGENCY_OVERLAY_DURATION_MS);
    }
    previousEmergencyActiveRef.current = isEmergencyActive;

    if (emg?.isActive && emg.overlayExecuteAt) {
      const executeTime = emg.overlayExecuteAt.toMillis();
      if (lastEmergencyAtRef.current !== executeTime) {
        lastEmergencyAtRef.current = executeTime;
        setEmergencyConfig({ type: emg.type || "DOWN", message: emg.message || "" });

        const delay = Math.max(0, executeTime - Date.now());
        if (emergencyStartTimerRef.current !== null) window.clearTimeout(emergencyStartTimerRef.current);
        if (emergencyHideTimerRef.current !== null) window.clearTimeout(emergencyHideTimerRef.current);
        emergencyStartTimerRef.current = window.setTimeout(() => {
          setShowEmergencyOverlay(true);
          emergencyHideTimerRef.current = window.setTimeout(() => setShowEmergencyOverlay(false), EMERGENCY_OVERLAY_DURATION_MS);
        }, delay);
      }
    } else {
      if (emergencyStartTimerRef.current !== null) window.clearTimeout(emergencyStartTimerRef.current);
      if (emergencyHideTimerRef.current !== null) window.clearTimeout(emergencyHideTimerRef.current);
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => {
        setShowEmergencyOverlay(false);
        setEmergencyConfig(null);
      }, 0);
      lastEmergencyAtRef.current = 0;
    }
  }, [systemSettings]);

  return { showEmergencyOverlay, showEmergencyResolvedOverlay, emergencyConfig };
}
