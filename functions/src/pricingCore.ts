export const DEFAULT_VOLATILITY_PERCENT = 5;
export const VOLATILITY_NOISE_INTERVAL_MS = 10 * 1000;
export const VOLATILITY_SETTLE_MS = 15 * 1000;

export interface MillisTimestamp {
  toMillis(): number;
}

export interface InterpolatedPriceRuntime {
  startPrice: number;
  endPrice: number;
  startAt: MillisTimestamp;
  endAt: MillisTimestamp;
  seed: number;
  fluctuationPercent?: number;
}

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (value: number) => {
  const t = clampUnit(value);
  return t * t * (3 - 2 * t);
};

const seededNoise = (seed: number, bucket: number) => {
  let hash = (Math.floor(seed * 1_000_000) ^ Math.imul(bucket, 0x45d9f3b)) | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
};

const interpolateNoise = (seed: number, elapsedMillis: number) => {
  const position = Math.max(0, elapsedMillis) / VOLATILITY_NOISE_INTERVAL_MS;
  const bucket = Math.floor(position);
  const blend = smoothstep(position - bucket);
  const from = seededNoise(seed, bucket);
  const to = seededNoise(seed, bucket + 1);
  return from + (to - from) * blend;
};

export const computeTeaseFactor = (progress: number, seed: number) => {
  void seed;
  return smoothstep(progress);
};

export const interpolatePrice = (runtime: InterpolatedPriceRuntime, nowMillis: number) => {
  const startMillis = runtime.startAt.toMillis();
  const endMillis = runtime.endAt.toMillis();
  if (nowMillis >= endMillis) return Math.max(1, Math.round(runtime.endPrice));
  if (endMillis <= startMillis) return Math.max(1, Math.round(runtime.endPrice));

  const progress = Math.min(1, Math.max(0, (nowMillis - startMillis) / (endMillis - startMillis)));
  const factor = computeTeaseFactor(progress, runtime.seed);
  const base = runtime.startPrice + (runtime.endPrice - runtime.startPrice) * factor;
  const remainingMillis = Math.max(0, endMillis - nowMillis);
  const settleFactor = Math.min(1, remainingMillis / VOLATILITY_SETTLE_MS);
  const elapsedMillis = Math.max(0, nowMillis - startMillis);
  const rampInFactor = Math.min(1, elapsedMillis / VOLATILITY_NOISE_INTERVAL_MS);
  const amplitude = runtime.startPrice * (DEFAULT_VOLATILITY_PERCENT / 100) * rampInFactor * settleFactor;
  return Math.max(1, Math.round(base + interpolateNoise(runtime.seed, elapsedMillis) * amplitude));
};
