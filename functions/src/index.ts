// functions/src/index.ts

import * as admin from "firebase-admin";

// 他のモジュールを読み込む前に、最優先で初期化を実行します
admin.initializeApp();

export { registerAgent, updateAgentNickname, bulkGenerateUsers, loginByShortId, deleteUsers } from "./users";
export { quoteStockPrice, tradeStock, finalizeAccount, undoFinalizeAccount, undoTransaction, markTicketUsed } from "./trade";
export { scheduleHeartbeats } from "./scheduler";
export { onStockPriceRankingWrite, onUserRankingFieldsWrite } from "./ranking";
export { performStockTick } from "./worker";
export { onMarketPhaseChange } from "./marketControl";
export { triggerScenarioEvent } from "./scenarioControl";
export { getServerTime } from "./time";
export { optimizeSignageVideo } from "./videoOptimizer";
export { cleanupExpiredTradeQuotes } from "./quoteCleanup";
