export const TIMELINE_MIN_EVENT_GAP_PX = 56;
export const TIMELINE_SIDE_PADDING_PX = 64;

interface TimelineScaleOptions {
  startMs: number;
  endMs: number;
  eventTimesMs: number[];
  minWidthPx: number;
  minEventGapPx?: number;
  sidePaddingPx?: number;
}

export function getTimelineContentWidth({
  startMs,
  endMs,
  eventTimesMs,
  minWidthPx,
  minEventGapPx = TIMELINE_MIN_EVENT_GAP_PX,
  sidePaddingPx = TIMELINE_SIDE_PADDING_PX,
}: TimelineScaleOptions) {
  const duration = Math.max(1, endMs - startMs);
  const sortedTimes = [...eventTimesMs]
    .filter(time => Number.isFinite(time))
    .sort((a, b) => a - b);

  let minGapMs = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sortedTimes.length; i += 1) {
    const gap = sortedTimes[i] - sortedTimes[i - 1];
    if (gap > 0) minGapMs = Math.min(minGapMs, gap);
  }

  if (!Number.isFinite(minGapMs)) return minWidthPx;

  const scaledWidth = (duration / minGapMs) * minEventGapPx + sidePaddingPx * 2;
  return Math.max(minWidthPx, Math.ceil(scaledWidth));
}

export function getTimelineX(
  timeMs: number,
  startMs: number,
  endMs: number,
  contentWidthPx: number,
  sidePaddingPx = TIMELINE_SIDE_PADDING_PX
) {
  const duration = Math.max(1, endMs - startMs);
  const drawableWidth = Math.max(1, contentWidthPx - sidePaddingPx * 2);
  const progress = Math.min(1, Math.max(0, (timeMs - startMs) / duration));
  return sidePaddingPx + progress * drawableWidth;
}
