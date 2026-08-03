import type { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export type AdminRole = "none" | "terminal" | "general" | "core";

export async function getAdminRole(user: FirebaseUser | null): Promise<AdminRole> {
  if (!user) return "none";

  const token = await user.getIdTokenResult();
  if (token.claims.coreAdmin === true) return "core";
  if (token.claims.admin === true) return "general";
  if (token.claims.terminalAdmin === true) return "terminal";

  const email = user.email?.trim().toLowerCase();
  if (!email) return "none";

  const adminSnap = await getDoc(doc(db, "admins", email));
  if (!adminSnap.exists()) return "none";

  const role = adminSnap.data().role;
  if (role === "core") return "core";
  if (role === "terminal") return "terminal";
  return "general";
}

export async function isAdminUser(user: FirebaseUser | null): Promise<boolean> {
  return (await getAdminRole(user)) !== "none";
}
