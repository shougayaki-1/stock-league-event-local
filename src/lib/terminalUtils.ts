import { collection, getDocs, query, where } from "firebase/firestore";
import type { User } from "../types/domain";
import { db } from "./firebase";
import { isPositiveIntegerInput, toExactString } from "./exactNumber";

export type OrderAmount = string | "MAX";

export const parseOrderAmount = (value: string): OrderAmount | null => {
  if (value.trim().toUpperCase() === "MAX") return "MAX";
  return isPositiveIntegerInput(value) ? toExactString(value) : null;
};

export const formatOrderAmount = (amount: OrderAmount | null) => amount === "MAX" ? "最大数" : amount?.toString() ?? "-";

export const lookupUserByShortId = async (shortId: string): Promise<User | null> => {
  const q = query(collection(db, "users"), where("shortId", "==", shortId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { ...(docSnap.data() as User), uid: docSnap.id };
};
