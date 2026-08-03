import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
  type Html5QrcodeCameraScanConfig,
} from "html5-qrcode";
import { Camera, Image as ImageIcon, Keyboard, RotateCcw, SwitchCamera } from "lucide-react";
import { extractUserIdPayload } from "../../lib/utils";
import { beginCriticalOperation } from "../../lib/criticalOperation";
import { createOperationId, recordClientDiagnostic } from "../../lib/clientDiagnostics";

export type QRScannerStatus =
  | "requesting-permission"
  | "starting"
  | "scanning"
  | "paused"
  | "error";

interface Props {
  onScan: (fullId: string) => void;
  onRawScan?: (text: string) => void;
  onStatusChange?: (status: QRScannerStatus) => void;
  onManualFallback?: () => void;
  /** 背面カメラを必須にし、利用者によるカメラ切替を許可しない。 */
  cameraMode?: "selectable" | "rear-locked";
}

const cameraErrorMessage = (error: unknown) => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "カメラが許可されていません。Safariのサイト設定からカメラを許可してください。";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "利用できるカメラが見つかりません。";
  if (name === "NotReadableError" || name === "AbortError") return "カメラを他のアプリが使用中です。アプリを閉じて再試行してください。";
  return `カメラを起動できませんでした。${error instanceof Error ? ` ${error.message}` : ""}`;
};

export default function QRScanner({ onScan, onRawScan, onStatusChange, onManualFallback, cameraMode = "selectable" }: Props) {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [status, setStatus] = useState<QRScannerStatus>("requesting-permission");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryRevision, setRetryRevision] = useState(0);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");

  const reactId = useId();
  const scannerId = `qr-reader-${reactId.replace(/:/g, "")}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(false);
  const releaseCriticalRef = useRef<(() => void) | null>(null);
  const onScanRef = useRef(onScan);
  const onRawScanRef = useRef(onRawScan);

  useEffect(() => {
    onScanRef.current = onScan;
    onRawScanRef.current = onRawScan;
  }, [onScan, onRawScan]);

  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    const showPage = () => setPageVisible(true);
    const hidePage = () => setPageVisible(false);
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("pageshow", showPage);
    window.addEventListener("pagehide", hidePage);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("pageshow", showPage);
      window.removeEventListener("pagehide", hidePage);
    };
  }, []);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      } catch (error) {
        console.warn("QR camera cleanup failed", error);
      }
    }
    releaseCriticalRef.current?.();
    releaseCriticalRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    const operationId = createOperationId("qr");
    const startedAt = performance.now();

    operationQueueRef.current = operationQueueRef.current.then(async () => {
      await stopScanner();
      if (cancelled || !pageVisible || !document.getElementById(scannerId)) {
        if (mountedRef.current) setStatus("paused");
        return;
      }

      setErrorMessage("");
      setStatus(selectedCamera ? "starting" : "requesting-permission");
      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      scannerRef.current = scanner;
      releaseCriticalRef.current = beginCriticalOperation();

      const containerWidth = document.getElementById(scannerId)?.clientWidth || 320;
      const boxSize = Math.max(180, Math.min(300, Math.round(containerWidth * 0.72)));
      const config: Html5QrcodeCameraScanConfig = {
        fps: 10,
        qrbox: { width: boxSize, height: boxSize },
        aspectRatio: 4 / 3,
        disableFlip: false,
      };

      try {
        await scanner.start(
          cameraMode === "rear-locked"
            ? { facingMode: { exact: "environment" } }
            : selectedCamera || { facingMode: "environment" },
          config,
          (text) => {
            const scanStartedAt = performance.now();
            onRawScanRef.current?.(text);
            onScanRef.current(extractUserIdPayload(text));
            recordClientDiagnostic(operationId, "qr-scan", scanStartedAt, "success");
          },
          undefined,
        );
        if (cancelled) {
          await stopScanner();
          return;
        }
        if (mountedRef.current) setStatus("scanning");
        recordClientDiagnostic(operationId, "qr-start", startedAt, "success");

        if (cameraMode === "selectable") {
          void Html5Qrcode.getCameras().then((devices) => {
            if (!mountedRef.current || cancelled) return;
            setCameras(devices);
          }).catch(() => { /* カメラ一覧は切替用の補助情報なので失敗しても読取を継続する。 */ });
        }
      } catch (error) {
        await stopScanner();
        if (!cancelled && mountedRef.current) {
          setStatus("error");
          setErrorMessage(cameraErrorMessage(error));
          recordClientDiagnostic(operationId, "qr-start", startedAt, "error", error);
        }
      }
    }).catch((error) => {
      if (mountedRef.current) {
        setStatus("error");
        setErrorMessage(cameraErrorMessage(error));
      }
    });

    return () => {
      cancelled = true;
      operationQueueRef.current = operationQueueRef.current.then(stopScanner);
    };
  }, [cameraMode, pageVisible, retryRevision, scannerId, selectedCamera]);

  const selectedCameraInfo = cameras.find((camera) => camera.id === selectedCamera);
  const isBackCamera = !selectedCameraInfo || /back|rear|environment|背面|アウト/i.test(selectedCameraInfo.label);
  const frontCamera = useMemo(
    () => cameras.find((camera) => /front|user|前面|イン/i.test(camera.label)),
    [cameras],
  );
  const backCamera = useMemo(
    () => cameras.find((camera) => /back|rear|environment|背面|アウト/i.test(camera.label)),
    [cameras],
  );

  const scanImageFile = (file: File) => {
    const operationId = createOperationId("qr-file");
    const startedAt = performance.now();
    operationQueueRef.current = operationQueueRef.current.then(async () => {
      await stopScanner();
      if (!mountedRef.current) return;
      setStatus("paused");
      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
        verbose: false,
      });
      scannerRef.current = scanner;
      try {
        const text = await scanner.scanFile(file, true);
        onRawScanRef.current?.(text);
        onScanRef.current(extractUserIdPayload(text));
        recordClientDiagnostic(operationId, "qr-scan", startedAt, "success");
      } catch (error) {
        if (mountedRef.current) {
          setStatus("error");
          setErrorMessage("画像からQRコードを読み取れませんでした。QR全体が写った画像を選んでください。");
        }
        recordClientDiagnostic(operationId, "qr-scan", startedAt, "error", error);
      } finally {
        await stopScanner();
        if (mountedRef.current) setRetryRevision((value) => value + 1);
      }
    });
  };

  const cameraName = (camera: { id: string; label: string }, index: number) => camera.label || `カメラ ${index + 1}`;
  const selectCamera = (cameraId: string) => {
    setErrorMessage("");
    setSelectedCamera(cameraId);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {cameraMode === "selectable" && cameras.length > 1 && (
        <div className="mb-4 w-full space-y-2">
          {frontCamera && backCamera && (
            <div className="grid grid-cols-2 gap-2" aria-label="カメラ切替">
              <button type="button" onClick={() => selectCamera(frontCamera.id)} aria-pressed={selectedCamera === frontCamera.id} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition ${selectedCamera === frontCamera.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}><Camera size={17} />インカメラ</button>
              <button type="button" onClick={() => selectCamera(backCamera.id)} aria-pressed={!selectedCamera || selectedCamera === backCamera.id} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition ${!selectedCamera || selectedCamera === backCamera.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}><SwitchCamera size={17} />アウトカメラ</button>
            </div>
          )}
          <select value={selectedCamera} onChange={(event) => selectCamera(event.target.value)} aria-label="使用するカメラ" className="p-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 w-full">
            <option value="">自動（背面カメラ）</option>
            {cameras.map((camera, index) => <option key={camera.id} value={camera.id}>{cameraName(camera, index)}</option>)}
          </select>
        </div>
      )}

      {errorMessage && <div role="alert" className="mb-4 p-4 w-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl">{errorMessage}</div>}
      <div id={scannerId} className={`w-full min-h-48 mx-auto overflow-hidden rounded-2xl bg-black ${!isBackCamera ? "-scale-x-100" : ""}`} />

      <div className="mt-4 grid w-full grid-cols-2 gap-2">
        <button type="button" onClick={() => setRetryRevision((value) => value + 1)} className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"><RotateCcw size={16} />再試行</button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"><ImageIcon size={16} />画像から読取</button>
      </div>
      {onManualFallback && <button type="button" onClick={onManualFallback} className="mt-2 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-indigo-600"><Keyboard size={16} />IDを手入力する</button>}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) scanImageFile(file);
      }} />
      <span className="sr-only" aria-live="polite">{status === "scanning" ? "QRコードを読み取り中です" : status === "paused" ? "カメラを一時停止しました" : "カメラを準備しています"}</span>
    </div>
  );
}
