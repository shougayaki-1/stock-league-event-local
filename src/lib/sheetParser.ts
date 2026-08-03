// src/lib/sheetParser.ts

export interface ParsedSheetData {
  shortId: string;
  stockId: string | null;
  type: "BUY" | "SELL" | null;
  amount: number;
  isMax: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Blob {
  cx: number;
  cy: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ----------------------------------------------------
// マークシートの物理位置グリッド（仮想座標系 400x282）
// ----------------------------------------------------
export const GRID_CONFIG = {
  yStart: 50,
  yEnd: 242,
  idX: [40, 56, 72, 88],
  opX: 140,
  opBuyRow: 1,
  opSellRow: 5,
  companyX: 220,
  companyRows: [1, 3.2, 5.2, 7.2, 9.2],
  amountX: [315, 331, 347],
};

function getRowY(rowFraction: number): number {
  const step = (GRID_CONFIG.yEnd - GRID_CONFIG.yStart) / 9;
  return GRID_CONFIG.yStart + rowFraction * step;
}

// ----------------------------------------------------
// 射影変換ユーティリティ
// ----------------------------------------------------
function solveLinearSystem(A: number[][], B: number[]): number[] {
  const n = B.length;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [B[i], B[maxRow]] = [B[maxRow], B[i]];
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      B[k] -= f * B[i];
      for (let j = i; j < n; j++) A[k][j] -= f * A[i][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) sum += A[i][j] * x[j];
    x[i] = (B[i] - sum) / A[i][i];
  }
  return x;
}

export function getPerspectiveTransform(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    B.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    B.push(dy);
  }
  const h = solveLinearSystem(A, B);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0];
}

function transformPoint(h: number[], p: Point): Point {
  const denom = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / denom,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / denom,
  };
}

// ----------------------------------------------------
// 【新設】画面全体から■アライメントマークを自動検出
//
// アプローチ：
//   1. 画面全体をダウンスケール(1/4)してピクセルを二値化
//   2. Union-Find で連結成分（黒い塊）を列挙
//   3. 面積・アスペクト比フィルタで正方形らしい塊を候補に
//   4. 4つの候補を「四隅」として選出（位置関係で左上/右上/右下/左下を識別）
// ----------------------------------------------------

export function detectAlignmentMarks(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
): Point[] | null {
  // ダウンスケール係数（処理を軽くするため 1/4 解像度で処理）
  const SCALE = 4;
  const W = Math.floor(canvasWidth / SCALE);
  const H = Math.floor(canvasHeight / SCALE);

  // ダウンスケールされた画像データを取得
  const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const src = imgData.data;

  // 二値マップ（true = 黒）を作成
  const binary = new Uint8Array(W * H);
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      // 4x4 ブロックの平均輝度
      let lum = 0;
      let cnt = 0;
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const px = sx * SCALE + dx;
          const py = sy * SCALE + dy;
          if (px < canvasWidth && py < canvasHeight) {
            const i = (py * canvasWidth + px) * 4;
            lum += 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
            cnt++;
          }
        }
      }
      // 平均輝度が 80 未満 = 黒
      binary[sy * W + sx] = (lum / cnt) < 80 ? 1 : 0;
    }
  }

  // Union-Find で連結成分ラベリング（4近傍）
  const label = new Int32Array(W * H).fill(-1);
  const parent: number[] = [];

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number) {
    a = find(a); b = find(b);
    if (a !== b) parent[b] = a;
  }

  let nextLabel = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!binary[y * W + x]) continue;
      const top = y > 0 ? label[(y - 1) * W + x] : -1;
      const left = x > 0 ? label[y * W + (x - 1)] : -1;

      if (top === -1 && left === -1) {
        label[y * W + x] = nextLabel;
        parent.push(nextLabel);
        nextLabel++;
      } else if (top !== -1 && left === -1) {
        label[y * W + x] = find(top);
      } else if (top === -1 && left !== -1) {
        label[y * W + x] = find(left);
      } else {
        union(top, left);
        label[y * W + x] = find(top);
      }
    }
  }

  // 各連結成分の統計（面積・バウンディングボックス）を集計
  const stats = new Map<number, { area: number; minX: number; minY: number; maxX: number; maxY: number; sumX: number; sumY: number }>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!binary[y * W + x]) continue;
      const id = find(label[y * W + x]);
      const s = stats.get(id);
      if (!s) {
        stats.set(id, { area: 1, minX: x, minY: y, maxX: x, maxY: y, sumX: x, sumY: y });
      } else {
        s.area++;
        s.sumX += x;
        s.sumY += y;
        if (x < s.minX) s.minX = x;
        if (y < s.minY) s.minY = y;
        if (x > s.maxX) s.maxX = x;
        if (y > s.maxY) s.maxY = y;
      }
    }
  }

  // ■候補フィルタリング
  // - アスペクト比が 0.5〜2.0 の間（ほぼ正方形）
  // - 面積が画面の 0.02%〜2% の範囲（小さすぎ・大きすぎを除外）
  const totalPixels = W * H;
  const blobs: Blob[] = [];

  for (const [, s] of stats) {
    const bw = s.maxX - s.minX + 1;
    const bh = s.maxY - s.minY + 1;
    const aspect = bw / bh;
    const areaRatio = s.area / totalPixels;

    if (aspect < 0.4 || aspect > 2.5) continue;
    if (areaRatio < 0.0002 || areaRatio > 0.025) continue;

    // バウンディングボックスの充填率（塗りつぶされているほど■らしい）
    const fillRate = s.area / (bw * bh);
    if (fillRate < 0.45) continue;

    blobs.push({
      cx: (s.sumX / s.area) * SCALE,
      cy: (s.sumY / s.area) * SCALE,
      area: s.area,
      minX: s.minX * SCALE,
      minY: s.minY * SCALE,
      maxX: s.maxX * SCALE,
      maxY: s.maxY * SCALE,
    });
  }

  if (blobs.length < 4) return null;

  // 画面の中心を基準に 4 象限（左上/右上/右下/左下）で最も大きい塊を1つずつ選ぶ
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  const quadrants = [
    blobs.filter(b => b.cx < cx && b.cy < cy), // 左上
    blobs.filter(b => b.cx >= cx && b.cy < cy), // 右上
    blobs.filter(b => b.cx >= cx && b.cy >= cy), // 右下
    blobs.filter(b => b.cx < cx && b.cy >= cy),  // 左下
  ];

  // 各象限で面積最大の候補を選択
  const corners: Point[] = [];
  for (const q of quadrants) {
    if (q.length === 0) return null;
    const best = q.reduce((a, b) => (b.area > a.area ? b : a));
    corners.push({ x: best.cx, y: best.cy });
  }

  return corners; // [左上, 右上, 右下, 左下]
}

// ----------------------------------------------------
// isMarked（変更なし、h_inv を受け取る前提）
// ----------------------------------------------------
export function isMarked(
  ctx: CanvasRenderingContext2D,
  h_inv: number[],
  relativePos: Point,
  sampleRadius: number = 4
): boolean {
  const targetCamPoint = transformPoint(h_inv, relativePos);
  const startX = Math.max(0, Math.round(targetCamPoint.x - sampleRadius));
  const startY = Math.max(0, Math.round(targetCamPoint.y - sampleRadius));
  const size = sampleRadius * 2;

  try {
    const imgData = ctx.getImageData(startX, startY, size, size);
    const data = imgData.data;
    let darkCount = 0;
    const total = size * size;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 110) darkCount++;
    }
    return darkCount / total > 0.40;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// parseSheet（射影方向を修正済み）
// ----------------------------------------------------
export function parseSheet(
  ctx: CanvasRenderingContext2D,
  alignmentPoints: Point[],
  stocksList: { id: string; name: string }[]
): ParsedSheetData {
  // 仮想座標系 → カメラ座標系 への行列（h_inv）
  const virtualPoints: Point[] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 282 },
    { x: 0, y: 282 },
  ];
  const h_inv = getPerspectiveTransform(virtualPoints, alignmentPoints);

  // 1. 個人ID
  let shortId = "";
  for (let col = 0; col < 4; col++) {
    let digit = "?";
    for (let row = 0; row < 10; row++) {
      if (isMarked(ctx, h_inv, { x: GRID_CONFIG.idX[col], y: getRowY(row) })) {
        digit = row.toString();
        break;
      }
    }
    shortId += digit;
  }

  // 2. 操作（売買）
  let type: "BUY" | "SELL" | null = null;
  const buyMarked = isMarked(ctx, h_inv, { x: GRID_CONFIG.opX, y: getRowY(GRID_CONFIG.opBuyRow) });
  const sellMarked = isMarked(ctx, h_inv, { x: GRID_CONFIG.opX, y: getRowY(GRID_CONFIG.opSellRow) });
  if (buyMarked && !sellMarked) type = "BUY";
  if (sellMarked && !buyMarked) type = "SELL";

  // 3. 銘柄
  let detectedStockIndex: number | null = null;
  for (let idx = 0; idx < GRID_CONFIG.companyRows.length; idx++) {
    if (isMarked(ctx, h_inv, { x: GRID_CONFIG.companyX, y: getRowY(GRID_CONFIG.companyRows[idx]) })) {
      detectedStockIndex = idx;
      break;
    }
  }
  const stockId = detectedStockIndex !== null && stocksList[detectedStockIndex]
    ? stocksList[detectedStockIndex].id
    : null;

  // 4. 株数
  let hundreds = 0, tens = 0, ones = 0;
  for (let r = 0; r < 10; r++) {
    if (isMarked(ctx, h_inv, { x: GRID_CONFIG.amountX[0], y: getRowY(r) })) { hundreds = r; break; }
  }
  for (let r = 0; r < 10; r++) {
    if (isMarked(ctx, h_inv, { x: GRID_CONFIG.amountX[1], y: getRowY(r) })) { tens = r; break; }
  }
  for (let r = 0; r < 10; r++) {
    if (isMarked(ctx, h_inv, { x: GRID_CONFIG.amountX[2], y: getRowY(r) })) { ones = r; break; }
  }

  const rawAmount = hundreds * 100 + tens * 10 + ones;
  const isMax = rawAmount === 999;

  return { shortId, stockId, type, amount: isMax ? 0 : rawAmount, isMax };
}