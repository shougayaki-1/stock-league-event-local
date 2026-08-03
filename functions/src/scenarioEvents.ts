import * as admin from "firebase-admin";
import { COL } from "./collections";
import {
  NewsPresetData,
  PriceChangeBranch,
  PriceChangeTarget,
  PriceRuntimeState,
  ScenarioProcessedParts,
  ScenarioSelectedBranch,
  ScenarioSignageAction,
} from "./types";

interface MarketEventData {
  priceChanges?: PriceChangeTarget[] | null;
  publicNewsPresetId?: string | null;
  postNewsPresetId?: string | null;
  postNewsDelaySeconds?: number | null;
  insiderNewsPresetId?: string | null;
  publicNews?: { title?: string; body?: string } | null;
  postNews?: { title?: string; body?: string; delaySeconds?: number | null } | null;
  insiderNews?: { title?: string; body?: string } | null;
  signageTargetId?: string | null;
  /** @deprecated Use public news preset breakingVideoId instead. */
  breakingVideoId?: string | null;
  /** @deprecated Use public news preset signageDisplay plus signageTargetId instead. */
  signageAction?: ScenarioSignageAction | null;
  stockId?: string | null;
  selectedBranches?: ScenarioSelectedBranch[] | null;
  processedParts?: ScenarioProcessedParts | null;
}

export interface ScenarioApplyContext {
  batch: admin.firestore.WriteBatch;
  loopNow: admin.firestore.Timestamp;
  settingsRef: admin.firestore.DocumentReference;
  runtime: Record<string, PriceRuntimeState | null>;
  stockPriceById: Record<string, number>;
  stockBasePriceById: Record<string, number>;
  newsPresetsById: Record<string, NewsPresetData>;
  markPriceEngineChanged: () => void;
  markWrite: () => void;
  clearPriorPostNews?: () => void;
  createRuntimeSeed: (stockId: string) => number;
}

const MINUTE_MS = 60 * 1000;

export type ScenarioTriggerPart = "ALL" | "MAIN" | "POST_NEWS";

export const chooseBranch = (branches: PriceChangeBranch[]) => {
  const rand = Math.random() * 100;
  let cumulativeProb = 0;
  for (const branch of branches) {
    cumulativeProb += (branch.probability || 0);
    if (rand <= cumulativeProb) return branch;
  }
  return branches[branches.length - 1] || null;
};

export const branchToScenarioRuntime = (
  branch: PriceChangeBranch,
  currentPrice: number,
  loopNow: admin.firestore.Timestamp,
  seed = Math.random() * 1000
): PriceRuntimeState => {
  const nowMillis = loopNow.toMillis();
  const legacyTargetPrice = typeof branch.targetPrice === "number" ? branch.targetPrice : null;
  const changePercent = typeof branch.changePercent === "number"
    ? branch.changePercent
    : legacyTargetPrice !== null && currentPrice > 0
      ? ((legacyTargetPrice - currentPrice) / currentPrice) * 100
      : 0;
  const deadlineMinutes = typeof branch.deadlineMinutes === "number" && Number.isFinite(branch.deadlineMinutes)
    ? Math.max(1, branch.deadlineMinutes)
    : 5;
  const endPrice = legacyTargetPrice !== null && typeof branch.changePercent !== "number"
    ? legacyTargetPrice
    : currentPrice * (1 + changePercent / 100);

  const runtime: PriceRuntimeState = {
    mode: "SCENARIO",
    phaseId: null,
    startPrice: currentPrice,
    endPrice: Math.max(1, Math.round(endPrice)),
    startAt: loopNow,
    endAt: admin.firestore.Timestamp.fromMillis(nowMillis + deadlineMinutes * MINUTE_MS),
    seed,
  };
  if (typeof branch.fluctuationPercent === "number" && Number.isFinite(branch.fluctuationPercent) && branch.fluctuationPercent >= 0) {
    runtime.fluctuationPercent = branch.fluctuationPercent;
  }
  return runtime;
};

const getPublicPreset = (ev: MarketEventData, presetsById: Record<string, NewsPresetData>) => (
  ev.publicNewsPresetId ? presetsById[ev.publicNewsPresetId] : undefined
);

const resolveBreakingVideoId = (ev: MarketEventData, presetsById: Record<string, NewsPresetData>) => (
  getPublicPreset(ev, presetsById)?.breakingVideoId || ev.breakingVideoId || null
);

const resolveSignageAction = (ev: MarketEventData, presetsById: Record<string, NewsPresetData>): ScenarioSignageAction | null => {
  const display = getPublicPreset(ev, presetsById)?.signageDisplay;
  const signageId = ev.signageTargetId || ev.signageAction?.signageId || "";
  if (display?.mode && signageId) {
    return {
      signageId,
      mode: display.mode,
      duration: display.duration,
      videoAssetId: display.videoAssetId || null,
      kind: display.kind || "NORMAL",
    };
  }
  return ev.signageAction?.signageId && ev.signageAction.mode ? ev.signageAction : null;
};

const hasMainPart = (ev: MarketEventData, presetsById: Record<string, NewsPresetData>) => Boolean(
  (ev.priceChanges && Array.isArray(ev.priceChanges) && ev.priceChanges.length > 0) ||
  ev.publicNewsPresetId ||
  ev.publicNews?.title ||
  resolveBreakingVideoId(ev, presetsById) ||
  resolveSignageAction(ev, presetsById)
);

const resolvePresetNews = (
  presetId: string | null | undefined,
  presetsById: Record<string, NewsPresetData>,
  delaySeconds = 0
) => {
  if (!presetId) return null;
  const preset = presetsById[presetId];
  if (!preset?.title) return null;
  return { title: preset.title, body: preset.body || "", delaySeconds };
};

const getPostNews = (ev: MarketEventData, presetsById: Record<string, NewsPresetData>) => (
  resolvePresetNews(ev.postNewsPresetId, presetsById, ev.postNewsDelaySeconds || 0) ||
  resolvePresetNews(ev.insiderNewsPresetId, presetsById, 0) ||
  (ev.postNews?.title ? { title: ev.postNews.title, body: ev.postNews.body || "", delaySeconds: ev.postNews.delaySeconds || 0 } : null) ||
  (ev.insiderNews?.title ? { title: ev.insiderNews.title, body: ev.insiderNews.body || "", delaySeconds: 0 } : null)
);

const getSelectedBranchPostNews = (
  ev: MarketEventData,
  presetsById: Record<string, NewsPresetData>,
  selectedBranches: ScenarioSelectedBranch[] | null | undefined
) => {
  if (!selectedBranches?.length || !Array.isArray(ev.priceChanges)) return [];
  return selectedBranches.flatMap((selected) => {
    const target = ev.priceChanges?.[selected.priceChangeIndex];
    const branch = target?.branches?.[selected.branchIndex];
    const postNews = resolvePresetNews(branch?.postNewsPresetId, presetsById, branch?.postNewsDelaySeconds || 0);
    const legacyPostNews = branch?.postNews?.title ? { title: branch.postNews.title, body: branch.postNews.body || "", delaySeconds: branch.postNews.delaySeconds || 0 } : null;
    const resolved = postNews || legacyPostNews;
    return resolved?.title ? [{ stockId: selected.stockId, postNews: resolved }] : [];
  });
};

const hasBranchPostNews = (ev: MarketEventData) => Boolean(
  ev.priceChanges?.some((target) => target.branches?.some((branch) => branch.postNewsPresetId || branch.postNews?.title))
);

const getPostNewsItems = (
  ev: MarketEventData,
  presetsById: Record<string, NewsPresetData>,
  selectedBranches: ScenarioSelectedBranch[] | null | undefined = ev.selectedBranches
) => {
  const branchItems = getSelectedBranchPostNews(ev, presetsById, selectedBranches);
  if (branchItems.length > 0) return branchItems;
  if (hasBranchPostNews(ev)) return [];
  const postNews = getPostNews(ev, presetsById);
  return postNews?.title ? [{ stockId: ev.stockId || null, postNews }] : [];
};

const getCompletionPatch = (
  ev: MarketEventData,
  processedParts: ScenarioProcessedParts,
  presetsById: Record<string, NewsPresetData>
) => {
  const mainDone = !hasMainPart(ev, presetsById) || processedParts.main === true;
  const postDone = !getPostNewsItems(ev, presetsById).length || processedParts.postNews === true;
  return {
    processedParts,
    isProcessed: mainDone && postDone,
  };
};

export const applyScenarioEvent = (
  evRef: admin.firestore.DocumentReference,
  ev: MarketEventData,
  ctx: ScenarioApplyContext,
  part: ScenarioTriggerPart = "ALL"
) => {
  const processedParts: ScenarioProcessedParts = { ...(ev.processedParts || {}) };
  const shouldProcessMain = part === "ALL" || part === "MAIN";
  const shouldProcessPost = part === "ALL" || part === "POST_NEWS";
  const selectedBranches: ScenarioSelectedBranch[] = [];

  if (shouldProcessMain && !processedParts.main && ev.priceChanges && Array.isArray(ev.priceChanges)) {
    ev.priceChanges.forEach((target, priceChangeIndex) => {
      if (!target.stockId || !Array.isArray(target.branches) || target.branches.length === 0) return;
      const selectedBranch = chooseBranch(target.branches);
      const branchIndex = selectedBranch ? target.branches.indexOf(selectedBranch) : -1;
      const currentPrice = ctx.stockPriceById[target.stockId];
      if (selectedBranch && typeof currentPrice === "number") {
        ctx.runtime[target.stockId] = branchToScenarioRuntime(selectedBranch, currentPrice, ctx.loopNow, ctx.createRuntimeSeed(target.stockId));
        ctx.stockPriceById[target.stockId] = currentPrice;
        selectedBranches.push({
          stockId: target.stockId,
          priceChangeIndex,
          branchIndex,
          ...(selectedBranch.label ? { branchLabel: selectedBranch.label } : {}),
        });
        ctx.markPriceEngineChanged();
      }
    });
  }

  const publicNews = resolvePresetNews(ev.publicNewsPresetId, ctx.newsPresetsById, 0) ||
    (ev.publicNews?.title ? { title: ev.publicNews.title, body: ev.publicNews.body || "", delaySeconds: 0 } : null);
  if (shouldProcessMain && !processedParts.main && publicNews) {
    ctx.clearPriorPostNews?.();
    ctx.batch.set(admin.firestore().collection(COL.news).doc(), {
      title: publicNews.title, body: publicNews.body || "", timestamp: ctx.loopNow, stockId: ev.stockId || null, target: "ALL", kind: "PUBLIC"
    });
    ctx.markWrite();
  }
  const postNewsItems = getPostNewsItems(ev, ctx.newsPresetsById, selectedBranches.length ? selectedBranches : ev.selectedBranches);
  if (shouldProcessPost && !processedParts.postNews && postNewsItems.length > 0) {
    if (part === "POST_NEWS") {
      postNewsItems.forEach(({ stockId, postNews }) => {
        ctx.batch.set(admin.firestore().collection(COL.news).doc(), {
          title: postNews.title,
          body: postNews.body || "",
          timestamp: ctx.loopNow,
          stockId: stockId || null,
          sourceEventId: evRef.id,
          target: "ALL",
          kind: "POST",
        });
      });
    } else {
      postNewsItems.forEach(({ stockId, postNews }) => {
        const deliverAt = admin.firestore.Timestamp.fromMillis(ctx.loopNow.toMillis() + (postNews.delaySeconds || 0) * 1000);
        ctx.batch.set(admin.firestore().collection(COL.scheduledPostNews).doc(), {
          title: postNews.title,
          body: postNews.body || "",
          deliverAt,
          timestamp: ctx.loopNow,
          stockId: stockId || null,
          sourceEventId: evRef.id,
          isDelivered: false,
          kind: "POST",
        });
      });
    }
    processedParts.postNews = true;
    ctx.markWrite();
  }
  const breakingVideoId = resolveBreakingVideoId(ev, ctx.newsPresetsById);
  if (shouldProcessMain && !processedParts.main && breakingVideoId) {
    ctx.batch.set(ctx.settingsRef, {
      activeBreakingNews: { videoId: breakingVideoId, timestamp: ctx.loopNow.toMillis() }
    }, { merge: true });
    ctx.markWrite();
  }

  const signageAction = resolveSignageAction(ev, ctx.newsPresetsById);
  if (shouldProcessMain && !processedParts.main && signageAction?.signageId && signageAction.mode) {
    const duration = Number.isFinite(signageAction.duration) ? Math.max(5, signageAction.duration) : 30;
    ctx.batch.set(admin.firestore().collection("public_signages").doc(signageAction.signageId), {
      scenarioOverride: {
        eventId: evRef.id,
        mode: signageAction.mode,
        duration,
        videoAssetId: signageAction.videoAssetId || null,
        kind: signageAction.kind || "NORMAL",
        startedAt: ctx.loopNow,
      }
    }, { merge: true });
    ctx.markWrite();
  }

  if (shouldProcessMain && !processedParts.main) {
    processedParts.main = true;
  }

  ctx.batch.update(evRef, {
    ...getCompletionPatch({ ...ev, selectedBranches: selectedBranches.length ? selectedBranches : ev.selectedBranches }, processedParts, ctx.newsPresetsById),
    ...(selectedBranches.length > 0 ? { selectedBranches } : {}),
  });
  ctx.markWrite();
};
