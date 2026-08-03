import { onCall } from "firebase-functions/v2/https";
import { CALL_OPTS } from "./utils";

export const getServerTime = onCall(CALL_OPTS, () => {
  return {
    serverTimeMillis: Date.now()
  };
});
