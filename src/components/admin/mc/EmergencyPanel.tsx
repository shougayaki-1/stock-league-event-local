import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, ShieldOff } from "lucide-react";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/Card";
import { useDialog } from "../../../contexts/DialogContext";
import { useMarketActions } from "../../../hooks/useMarketActions";
import type { SystemStatus } from "../../../types/domain";

const EMERGENCY_PRESETS = {
  DOWN: {
    message: "緊急速報: 市場全体に急落リスクが発生しています。落ち着いて判断してください。",
    overlayDelaySec: 3,
    priceDelaySec: 2,
  },
  UP: {
    message: "緊急速報: 市場全体に急騰チャンスが発生しています。次の値動きに注目してください。",
    overlayDelaySec: 3,
    priceDelaySec: 2,
  }
} as const;

interface Props {
  emergencyState?: SystemStatus["emergencyState"];
}

export default function EmergencyPanel({ emergencyState }: Props) {
  const { confirm } = useDialog();
  const { triggerEmergency, stopEmergency } = useMarketActions();
  const isActive = emergencyState?.isActive === true;

  const handleTrigger = async (type: "UP" | "DOWN") => {
    const label = type === "UP" ? "緊急急騰" : "緊急暴落";
    const ok = await confirm({
      title: `${label}を発動しますか？`,
      message: `一般モニターに${EMERGENCY_PRESETS[type].overlayDelaySec}秒後に緊急オーバーレイを表示し、さらに${EMERGENCY_PRESETS[type].priceDelaySec}秒後に価格変動を開始します。`,
      confirmText: "発動する",
      variant: "warning"
    });
    if (!ok) return;
    await triggerEmergency(type, EMERGENCY_PRESETS[type].message, EMERGENCY_PRESETS[type].overlayDelaySec, EMERGENCY_PRESETS[type].priceDelaySec);
  };

  const handleStop = async () => {
    const ok = await confirm({
      title: "緊急状態を解除しますか？",
      message: "一般モニターの緊急表示を解除します。",
      confirmText: "解除する"
    });
    if (!ok) return;
    await stopEmergency();
  };

  return (
    <Card>
      <CardHeader className="p-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle size={18} /> 緊急操作</CardTitle>
          <Badge variant={isActive ? "danger" : "default"}>{isActive ? `発動中 ${emergencyState?.type || ""}` : "待機中"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {isActive && (
          <div className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-xs font-bold text-error">
            {emergencyState?.message || "緊急状態が発動中です。"}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-12 px-3 text-sm" variant="danger" onClick={() => handleTrigger("DOWN")}>
            <ArrowDownCircle size={16} className="shrink-0" /> 暴落
          </Button>
          <Button className="h-12 px-3 text-sm" variant="primary" onClick={() => handleTrigger("UP")}>
            <ArrowUpCircle size={16} className="shrink-0" /> 急騰
          </Button>
        </div>
        <Button className="h-11 w-full px-3 text-sm" variant="outline" disabled={!isActive} onClick={handleStop}>
          <ShieldOff size={16} className="shrink-0" /> 緊急解除
        </Button>
      </CardContent>
    </Card>
  );
}
