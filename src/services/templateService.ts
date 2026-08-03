import { addDoc, collection, deleteDoc, doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CustomTemplate } from "../types/scenario";

const TEMPLATES_COLLECTION = "templates";

export function subscribeTemplates(onNext: (templates: CustomTemplate[]) => void): Unsubscribe {
  return onSnapshot(collection(db, TEMPLATES_COLLECTION), (snap) => {
    onNext(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomTemplate)));
  });
}

export interface TemplateWritePayload {
  name: string;
  publicTitle: string;
  publicBody: string;
  postTitle: string;
  postBody: string;
  insiderTitle: string;
  insiderBody: string;
  targetMultiplier: number;
}

export function createTemplate(payload: TemplateWritePayload) {
  return addDoc(collection(db, TEMPLATES_COLLECTION), payload);
}

export function deleteTemplate(templateId: string) {
  return deleteDoc(doc(db, TEMPLATES_COLLECTION, templateId));
}
