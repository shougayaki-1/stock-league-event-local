// functions/test/helpers/emulator.ts
//
// Firestore + Auth Emulator と実結合しつつ、Cloud Functions のハンドラは
// firebase-functions-test の wrap() で「直接呼び出し」する方式のテストヘルパー。
//
// 経緯（重要）: 当初は `firebase emulators:exec --only firestore,auth,functions` で
// Functions Emulator のHTTP経路を通す設計だったが、Functions Emulator が
// `firebase-admin` モジュールをProxyでラップする実装（functionsEmulatorRuntime.js の
// initializeFirebaseAdminStubs）が `admin.firestore` を `Function.prototype.bind()` で
// 返すため、`admin.firestore` に直接生えている静的プロパティ（FieldValue/Timestamp等）が
// 失われ、`admin.firestore.FieldValue.serverTimestamp()` を使うコードパス
// （tradeStock, finalizeAccount, markTicketUsed, registerAgent, bulkGenerateUsers 等）が
// 軒並み "Cannot read properties of undefined (reading 'serverTimestamp')" で失敗した。
// これは firebase-tools の Functions Emulator 特有の非互換であり、本番デプロイでは
// このProxyを経由しないため発生しない（本番相当の挙動を検証するにはこの直接呼び出し方式が適切）。
//
// 実行: npm run test:functions (ルートから。`firebase emulators:exec --only firestore,auth` の子プロセスとして実行される)

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-stock-league-event-local-test";

// functions/lib/index.js が最初に admin.initializeApp() を呼ぶため、
// 他のどのコードよりも先にこのモジュールを読み込む必要がある。
import * as functionsModule from "../../lib/index.js";
import * as admin from "firebase-admin";
import firebaseFunctionsTest from "firebase-functions-test";

export const PROJECT_ID = "demo-stock-league-event-local-test";

const testEnv = firebaseFunctionsTest({ projectId: PROJECT_ID });

export function adminDb() {
  return admin.firestore();
}

export function adminAuth() {
  return admin.auth();
}

export interface CallAuth {
  uid: string;
  token?: Record<string, unknown>;
}

/**
 * onCall (v2) ハンドラを Functions Emulator を経由せず直接呼び出す。
 * request.data / request.auth のみを組み立てて渡す（rawRequest 等は業務ロジックが参照しないため省略）。
 */
export function call<Req extends object, Res>(
  fn: unknown,
  data: Req,
  auth?: CallAuth
): Promise<{ data: Res }> {
  const wrapped = testEnv.wrap(fn as never);
  return Promise.resolve(
    wrapped({
      data,
      auth: auth ? { uid: auth.uid, token: auth.token || {} } : undefined,
    } as never)
  ).then((res) => ({ data: res as Res }));
}

export const fns = functionsModule;

// --- シードヘルパー（Admin SDK経由。Firestore Rulesをバイパスして直接投入する） ---

export async function seedUser(uid: string, data: Partial<Record<string, unknown>> = {}) {
  await adminDb()
    .collection("users")
    .doc(uid)
    .set({
      uid,
      shortId: uid.slice(0, 4),
      nickname: `テスト太郎(${uid})`,
      points: "1000",
      inventory: {},
      courseType: "TRADER",
      isFinished: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ...data,
    });
}

export async function seedSystemSettings(data: Partial<Record<string, unknown>> = {}) {
  await adminDb()
    .collection("settings")
    .doc("system")
    .set({
      globalPhase: "RUNNING",
      initialPoint: "1000",
      slippageTolerance: 0.05,
      ...data,
    });
}

export async function seedMarket(stocks: Array<{ id: string; name: string; currentPrice: number }>) {
  await adminDb()
    .collection("public_data")
    .doc("market_for_users")
    .set({
      stocks,
      runtime: {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  for (const s of stocks) {
    await adminDb()
      .collection("stocks")
      .doc(s.id)
      .set({ id: s.id, name: s.name, currentPrice: s.currentPrice });
  }
}

/**
 * Firestore と Auth の Emulator データを全消去する（テストケース間の分離用）。
 */
export async function clearAllEmulatorData() {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: "DELETE",
  });
}
