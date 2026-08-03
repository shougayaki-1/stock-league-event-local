import { useDialog } from "../contexts/DialogContext";
import type { StockPricePhase } from "../lib/marketPricing";
import type { PriceAnomalyFix } from "../lib/priceAnomalyDetection";
import type { ScenarioEvent } from "../types/scenario";
import type { PriceChangeBranch, PriceChangeTarget } from "../types/domain";
import {
  addMarketStock,
  deleteMarketEvent,
  deleteMarketStock,
  editMarketStock,
  getIsMarketStopped,
  publishMarketNewsNow,
  saveMarketStockPhases,
  scheduleMarketEvent,
  setMarketSystemPhase,
  stopMarketEmergency,
  triggerMarketEmergency,
  updateMarketEvent,
  updateMarketEvents,
  updateMarketTargetPrice,
  updateScheduledMarketEvent,
} from "../services/marketService";
import { DEFAULT_STOCK_PHASES, validateStockPhases } from "../lib/stockPhaseCsv";

export type { StockPriceDirection, StockPricePhase } from "../lib/marketPricing";
export type { PriceChangeBranch, PriceChangeTarget } from "../types/domain";
export { DEFAULT_STOCK_PHASES, validateStockPhases } from "../lib/stockPhaseCsv";

const applyFixToEvent = (event: ScenarioEvent, fix: PriceAnomalyFix) => {
  if (fix.kind === "OFFSET") {
    return { offsetSeconds: fix.newOffsetSeconds, isProcessed: false };
  }

  const priceChanges = (event.priceChanges ?? []).map((target, priceChangeIndex) => {
    if (priceChangeIndex !== fix.priceChangeIndex) return target;
    return {
      ...target,
      branches: target.branches.map((branch, branchIndex) => {
        if (branchIndex !== fix.branchIndex) return branch;
        const nextBranch: PriceChangeBranch = { ...branch, ...fix.patch };
        if (Object.prototype.hasOwnProperty.call(fix.patch, "targetPrice") && fix.patch.targetPrice === undefined) delete nextBranch.targetPrice;
        if (Object.prototype.hasOwnProperty.call(fix.patch, "changePercent") && fix.patch.changePercent === undefined) delete nextBranch.changePercent;
        if (Object.prototype.hasOwnProperty.call(fix.patch, "deadlineMinutes") && fix.patch.deadlineMinutes === undefined) delete nextBranch.deadlineMinutes;
        return nextBranch;
      }),
    };
  });

  return { priceChanges, isProcessed: false };
};

export function useMarketActions() {
  const { alert, confirm } = useDialog();

  const setSystemPhase = async (phase: string, options?: { silent?: boolean }) => {
    try {
      await setMarketSystemPhase(phase);
      if (!options?.silent) await alert({ title: "フェーズ更新", message: `システムを [ ${phase} ] に変更しました。`, variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "フェーズの変更に失敗しました。", variant: "danger" });
    }
  };

  const triggerEmergency = async (type: "UP" | "DOWN", message: string, overlayDelay: number, priceDelay: number, options?: { silent?: boolean }) => {
    try {
      await triggerMarketEmergency(type, message, overlayDelay, priceDelay);
      const msg = `演出は ${overlayDelay}秒後、価格変動はその ${priceDelay}秒後 に開始されます。`;
      if (!options?.silent) await alert({ title: "緊急発動", message: msg, variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "緊急事態の発動に失敗しました。", variant: "danger" });
    }
  };

  const stopEmergency = async (options?: { silent?: boolean }) => {
    try {
      await stopMarketEmergency();
      if (!options?.silent) await alert({ title: "解除完了", message: "緊急事態を解除し、平常モードに戻しました。", variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "解除に失敗しました。", variant: "danger" });
    }
  };

  const updateTargetPrice = async (stockId: string, name: string, newPrice: number, delaySeconds: number = 0, options?: { silent?: boolean }) => {
    try {
      await updateMarketTargetPrice(stockId, newPrice, delaySeconds);
      const delayMsg = delaySeconds > 0 ? `${delaySeconds}秒後に ` : "";
      if (!options?.silent) await alert({ title: "介入完了", message: `${name} の目標価格を ${delayMsg}${newPrice} pt に設定しました。`, variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "価格の更新に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const addStock = async (stockId: string, name: string, initialPrice: number) => {
    const cleanId = stockId.trim();
    const cleanName = name.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(cleanId)) {
      await alert({ title: "入力エラー", message: "銘柄IDは半角英数字・ハイフン・アンダースコアのみ使用できます。", variant: "danger" });
      return false;
    }
    if (!cleanName || !Number.isFinite(initialPrice) || initialPrice <= 0) {
      await alert({ title: "入力エラー", message: "企業名と1以上の初期株価を入力してください。", variant: "danger" });
      return false;
    }
    try {
      await addMarketStock(cleanId, cleanName, initialPrice);
      await alert({ title: "銘柄追加", message: `${cleanName} を上場しました！`, variant: "success" });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === "DUPLICATE_STOCK") {
        await alert({ title: "入力エラー", message: "同じ銘柄IDが既に存在します。", variant: "danger" });
        return false;
      }
      await alert({ title: "エラー", message: "銘柄の追加に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const editStock = async (stockId: string, newName: string, options?: { silent?: boolean }) => {
    try {
      await editMarketStock(stockId, newName);
      if (!options?.silent) await alert({ title: "更新完了", message: "銘柄情報を更新しました。", variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "銘柄の更新に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const saveStockPhases = async (stockId: string, phases: StockPricePhase[], options?: { silent?: boolean }) => {
    try {
      const validationError = validateStockPhases(phases.length > 0 ? phases : DEFAULT_STOCK_PHASES);
      if (validationError) {
        if (!options?.silent) await alert({ title: "保存エラー", message: validationError, variant: "danger" });
        return false;
      }
      await saveMarketStockPhases(stockId, phases);
      if (!options?.silent) await alert({ title: "保存完了", message: "価格フェーズ設定を保存しました。次の更新から反映されます。", variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "価格フェーズ設定の保存に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const deleteStock = async (stockId: string, name: string) => {
    const isOk = await confirm({
      title: "上場廃止の確認",
      message: `${name} を本当に上場廃止(削除)しますか？\n（すでに株を保有しているユーザーのデータと不整合が起きる可能性があります）`,
      variant: "danger"
    });
    if (!isOk) return false;
    try {
      await deleteMarketStock(stockId);
      await alert({ title: "削除完了", message: `${name} を削除しました。`, variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "削除に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const scheduleEvent = async (
    date: string, time: string, priceChanges: PriceChangeTarget[],
    publicNews: { title: string, body: string, delaySeconds: number },
    postNews: { title: string, body: string, delaySeconds: number },
    breakingVideoId: string | null
  ) => {
    try {
      await scheduleMarketEvent(date, time, priceChanges, publicNews, postNews, breakingVideoId);
      await alert({ title: "予約完了", message: "イベントを分割登録しました。", variant: "success" });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "予約に失敗しました。";
      await alert({ title: "エラー", message: msg, variant: "danger" });
      return false;
    }
  };

  // ★ 修正：イベント編集用の処理を追加
  const updateEvent = async (
    eventId: string,
    date: string,
    time: string,
    priceChanges: PriceChangeTarget[],
    publicNews: { title: string, body: string, delaySeconds: number },
    postNews: { title: string, body: string, delaySeconds: number },
    breakingVideoId: string | null
  ) => {
    try {
      await updateScheduledMarketEvent(eventId, date, time, priceChanges, publicNews, postNews, breakingVideoId);
      await alert({ title: "更新完了", message: "イベント情報を書き換えました。", variant: "success" });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "更新に失敗しました。";
      await alert({ title: "エラー", message: msg, variant: "danger" });
      return false;
    }
  };

  const publishNewsNow = async (
    priceChanges: PriceChangeTarget[],
    publicNewsPresetId: string | null,
    postNewsPresetId: string | null,
    postNewsDelaySeconds: number | null,
    insiderNewsPresetId: string | null,
    signageTargetId: string | null = null
  ) => {
    const isStopped = await getIsMarketStopped();

    const warningMsg = isStopped
      ? "\n\n⚠️注意：現在市場は「STOP」状態です。ニュースは配信されますが、株価変動は市場が「RUNNING」になるまで発動せず予約されたままになります。"
      : "";

    const isOk = await confirm({
      title: "即時配信の確認",
      message: `今すぐ実行しますか？${warningMsg}`,
      confirmText: "今すぐ実行する",
      variant: isStopped ? "warning" : "info"
    });
    if (!isOk) return false;

    try {
      await publishMarketNewsNow(priceChanges, publicNewsPresetId, postNewsPresetId, postNewsDelaySeconds, insiderNewsPresetId, signageTargetId);
      await alert({ title: "実行完了", message: "即時実行しました。", variant: "success" });
      return true;
    } catch (err) {
      console.error(err);
      await alert({ title: "エラー", message: "実行に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const deleteEvent = async (id: string) => {
    const isOk = await confirm({ title: "イベントの削除", message: "削除しますか？", variant: "danger" });
    if (isOk) await deleteMarketEvent(id);
  };

  const applyScenarioAnomalyFix = async (event: ScenarioEvent | undefined, fix: PriceAnomalyFix) => {
    if (!event) {
      await alert({ title: "エラー", message: "対象イベントが見つかりません。", variant: "danger" });
      return false;
    }
    try {
      await updateMarketEvent(event.id, applyFixToEvent(event, fix));
      await alert({ title: "補正完了", message: "シナリオイベントへ補正案を適用しました。", variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "補正の適用に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const applyScenarioAnomalyFixes = async (events: ScenarioEvent[], fixes: PriceAnomalyFix[]) => {
    const eventById = new Map(events.map((event) => [event.id, event]));
    const mergedPayloads = new Map<string, Record<string, unknown>>();

    fixes.forEach((fix) => {
      const source = eventById.get(fix.eventId);
      if (!source) return;
      const currentEvent = {
        ...source,
        ...(mergedPayloads.get(fix.eventId) ?? {}),
      } as ScenarioEvent;
      mergedPayloads.set(fix.eventId, applyFixToEvent(currentEvent, fix));
    });

    if (mergedPayloads.size === 0) {
      await alert({ title: "お知らせ", message: "適用できる補正案がありません。", variant: "info" });
      return false;
    }

    try {
      await updateMarketEvents(mergedPayloads);
      await alert({ title: "一括補正完了", message: `${mergedPayloads.size} 件のイベントを更新しました。`, variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "一括補正に失敗しました。", variant: "danger" });
      return false;
    }
  };

  return {
    setSystemPhase,
    triggerEmergency,
    stopEmergency,
    updateTargetPrice,
    addStock,
    editStock,
    saveStockPhases,
    deleteStock,
    scheduleEvent,
    updateEvent,
    publishNewsNow,
    deleteEvent,
    applyScenarioAnomalyFix,
    applyScenarioAnomalyFixes
  };
}
