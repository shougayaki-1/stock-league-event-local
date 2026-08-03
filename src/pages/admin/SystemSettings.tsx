// src/pages/admin/SystemSettings.tsx

import React, { useState, useEffect, useCallback } from "react";
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import { useStocks } from "../../hooks/useFirebase";
import type { PrizeGrade, User } from "../../types/domain";
import { Settings, Download, AlertTriangle, Gift, ShieldCheck, Smartphone, FileText, Save, RotateCcw, Calculator, Leaf } from "lucide-react";
import Papa from "papaparse";

import UnsavedBar from "../../components/admin/UnsavedBar";
import Button from "../../components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/Card";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import Textarea from "../../components/ui/Textarea";
import PrizeSettingsCard from "../../components/admin/system/PrizeSettingsCard"; // 新設
import AdminManagerCard from "../../components/admin/system/AdminManagerCard"; // 新設

import { useDialog } from "../../contexts/DialogContext";
import { useSystemActions } from "../../hooks/useSystemActions";
import { getAdminRole, type AdminRole } from "../../services/admin";
import { compareExact, formatExact, isPositiveIntegerInput, toExactString } from "../../lib/exactNumber";
import { DEFAULT_INFO_PAGE_MARKDOWN, MarkdownContent } from "../../components/info/infoPageContent";
import { DEFAULT_TRADE_QUANTITY_PRESETS, normalizeTradeQuantityPresets } from "../../lib/appConstants";

const DEFAULT_PRIZES: PrizeGrade[] = [
  { id: "S", threshold: 10000, desc: "うまい棒10本 + 優先券" },
  { id: "A", threshold: 5000, desc: "うまい棒5本" },
  { id: "B", threshold: 1000, desc: "うまい棒2本" },
  { id: "C", threshold: 0, desc: "参加賞（飴1個）" }
];

const clonePrizes = (prizes: PrizeGrade[]) => JSON.parse(JSON.stringify(prizes)) as PrizeGrade[];

const normalizeConfirmWord = (word: string | null | undefined) => word?.trim().toUpperCase() || "";

export default function SystemSettings() {
  const stocks = useStocks();
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const { alert, prompt, confirm } = useDialog();
  const { forceFinalizeAll, resetAllUsersForNextDay, saveSettings } = useSystemActions();

  type EditableAdminRole = Exclude<AdminRole, "none">;

  const [adminsList, setAdminsList] = useState<{ email: string; addedAt?: string; role?: EditableAdminRole }[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [dangerAction, setDangerAction] = useState<"finalize" | "reset" | null>(null);

  const [currentUserRole, setCurrentUserRole] = useState<"general" | "core">("general");
  const [activeTab, setActiveTab] = useState<"closing" | "info" | "prizes" | "quantities" | "admins">("closing");

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      try {
        const role = await getAdminRole(user);
        setCurrentUserRole(role === "core" ? "core" : "general");
      } catch (e) {
        console.error(e);
        setCurrentUserRole("general");
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsubAdmins = onSnapshot(collection(db, "admins"), (snap) => {
      const list = snap.docs.map(d => ({
        email: d.id,
        addedAt: d.data().addedAt,
        role: d.data().role || "general"
      }));
      setAdminsList(list);
    });
    return () => unsubAdmins();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await alert({
        title: "入力エラー",
        message: "正しいメールアドレスを入力してください。",
        variant: "danger"
      });
      return;
    }
    if (adminsList.some(admin => admin.email.toLowerCase() === email)) {
      await alert({ title: "登録済み", message: "このメールアドレスは既に管理者に登録されています。", variant: "warning" });
      return;
    }

    setAddingAdmin(true);
    try {
      await setDoc(doc(db, "admins", email), {
        addedAt: new Date().toISOString(),
        role: "general"
      });
      setNewAdminEmail("");
      await alert({
        title: "登録完了",
        message: `${email} を管理者に登録しました。`,
        variant: "success"
      });
    } catch (e) {
      console.error(e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      await alert({
        title: "エラー",
        message: "管理者アカウントの追加に失敗しました。 " + errorMsg,
        variant: "danger"
      });
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (emailToDelete: string) => {
    const confirmResult = await prompt({
      title: "⚠️ 管理者権限の削除",
      message: `${emailToDelete} の管理者権限を削除しますか？\n削除するには「DELETE」と入力してください。`,
      variant: "danger",
      placeholder: "DELETE"
    });

    const expectedSelf = auth.currentUser?.email?.toLowerCase() === emailToDelete.toLowerCase();
    if (normalizeConfirmWord(confirmResult) === "DELETE") {
      if (expectedSelf) {
        const selfWord = await prompt({ title: "自分の権限を削除しますか？", message: "現在ログイン中の管理者です。続行する場合は「DELETE」と再入力してください。", variant: "danger", placeholder: "DELETE" });
        if (normalizeConfirmWord(selfWord) !== "DELETE") return;
      }
      try {
        await deleteDoc(doc(db, "admins", emailToDelete));
        await alert({
          title: "削除完了",
          message: "管理者権限を削除しました。",
          variant: "success"
        });
      } catch (e) {
        console.error(e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        await alert({
          title: "エラー",
          message: "管理者権限の削除に失敗しました。 " + errorMsg,
          variant: "danger"
        });
      }
    } else if (confirmResult) {
      await alert({ title: "中止しました", message: "確認ワードが一致しなかったため実行しませんでした。", variant: "warning" });
    }
  };

  const handleRoleChange = async (email: string, newRole: EditableAdminRole) => {
    if (auth.currentUser?.email?.toLowerCase() === email.toLowerCase() && newRole !== "core") {
      const word = await prompt({ title: "自分の権限を変更しますか？", message: "現在ログイン中の管理者をコア管理者以外に変更すると、管理機能へ戻れなくなる可能性があります。続行する場合は「CHANGE」と入力してください。", variant: "danger", placeholder: "CHANGE" });
      if (normalizeConfirmWord(word) !== "CHANGE") {
        if (word) await alert({ title: "中止しました", message: "確認ワードが一致しなかったため実行しませんでした。", variant: "warning" });
        return;
      }
    }
    try {
      const docRef = doc(db, "admins", email);
      await setDoc(docRef, { role: newRole }, { merge: true });
      await alert({
        title: "更新完了",
        message: `${email} の権限を ${newRole === "core" ? "コア管理者" : newRole === "terminal" ? "端末専用" : "一般管理者"} に変更しました。`,
        variant: "success"
      });
    } catch (e) {
      console.error(e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      await alert({
        title: "エラー",
        message: "権限の変更に失敗しました。 " + errorMsg,
        variant: "danger"
      });
    }
  };

  const [originalPrizes, setOriginalPrizes] = useState<PrizeGrade[]>([]);
  const [editingPrizes, setEditingPrizes] = useState<PrizeGrade[]>([]);

  const [currentInitialPoint, setCurrentInitialPoint] = useState("1000");
  const [showInfoPageOnLogin, setShowInfoPageOnLogin] = useState(true);
  const [ecoMode, setEcoMode] = useState(false);
  const [originalInfoMarkdown, setOriginalInfoMarkdown] = useState(DEFAULT_INFO_PAGE_MARKDOWN);
  const [editingInfoMarkdown, setEditingInfoMarkdown] = useState(DEFAULT_INFO_PAGE_MARKDOWN);
  const [savingInfoMarkdown, setSavingInfoMarkdown] = useState(false);
  const [originalQuantityPresets, setOriginalQuantityPresets] = useState<string[]>([...DEFAULT_TRADE_QUANTITY_PRESETS]);
  const [editingQuantityPresets, setEditingQuantityPresets] = useState<string[]>([...DEFAULT_TRADE_QUANTITY_PRESETS]);
  const [savingQuantityPresets, setSavingQuantityPresets] = useState(false);

  const refreshUsers = useCallback(async () => {
    const snap = await getDocs(collection(db, "users"));
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
    users.sort((a, b) => compareExact(b.points, a.points));
    setAllUsers(users);
    return users;
  }, []);

  useEffect(() => {
    const unsubPrizes = onSnapshot(doc(db, "settings", "prizes"), (snap) => {
      const data = clonePrizes(snap.exists() && snap.data().grades ? snap.data().grades : DEFAULT_PRIZES);
      setOriginalPrizes((prevOriginal) => {
        setEditingPrizes(prevEditing => JSON.stringify(prevEditing) === JSON.stringify(prevOriginal) || prevEditing.length === 0 ? clonePrizes(data) : prevEditing);
        return clonePrizes(data);
      });
    });

    const unsubSys = onSnapshot(doc(db, "settings", "system"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.initialPoint !== undefined) {
          setCurrentInitialPoint(toExactString(data.initialPoint));
        }
        setShowInfoPageOnLogin(data.showInfoPageOnLogin !== false);
        setEcoMode(data.ecoMode === true);
        const nextQuantityPresets = normalizeTradeQuantityPresets(data.tradeQuantityPresets);
        setOriginalQuantityPresets((previous) => {
          setEditingQuantityPresets((editing) => JSON.stringify(editing) === JSON.stringify(previous) ? nextQuantityPresets : editing);
          return nextQuantityPresets;
        });
        const nextInfoMarkdown = typeof data.infoPageMarkdown === "string" && data.infoPageMarkdown.trim()
          ? data.infoPageMarkdown
          : DEFAULT_INFO_PAGE_MARKDOWN;
        setOriginalInfoMarkdown((prevOriginal) => {
          setEditingInfoMarkdown(prevEditing => prevEditing === prevOriginal ? nextInfoMarkdown : prevEditing);
          return nextInfoMarkdown;
        });
      }
    });

    const timer = window.setTimeout(() => {
      void refreshUsers();
    }, 0);

    return () => { unsubPrizes(); unsubSys(); window.clearTimeout(timer); };
  }, [refreshUsers]);

  const hasChanges = JSON.stringify(editingPrizes) !== JSON.stringify(originalPrizes);
  const hasInfoChanges = editingInfoMarkdown !== originalInfoMarkdown;

  const handleReset = () => {
    setEditingPrizes(JSON.parse(JSON.stringify(originalPrizes)));
  };

  const handleSave = async () => {
    const errors = editingPrizes.flatMap((prize, index) => {
      const label = `景品${index + 1}`;
      const result: string[] = [];
      if (!String(prize.id || "").trim()) result.push(`${label}: 賞の名前を入力してください。`);
      if (!String(prize.desc || "").trim()) result.push(`${label}: 景品内容を入力してください。`);
      if (!isPositiveIntegerInput(prize.threshold) && toExactString(prize.threshold) !== "0") result.push(`${label}: 閾値は0以上の整数で入力してください。`);
      return result;
    });
    if (errors.length > 0) {
      await alert({ title: "保存できません", message: errors.join("\n"), variant: "warning" });
      return;
    }
    await saveSettings(editingPrizes);
    setOriginalPrizes(JSON.parse(JSON.stringify(editingPrizes)));
  };

  const exportRankingCSV = async () => {
    const users = await refreshUsers();
    const csvData = (users || allUsers).map((u, index) => ({
      順位: index + 1, ID: u.shortId, ニックネーム: u.nickname, ポイント: formatExact(u.points), コース: u.courseType, 確定済: u.isFinished ? "済" : "未"
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    link.download = `ranking_${stamp}.csv`;
    link.click();
  };

  const handleForceFinalize = async () => {
    const word = await prompt({
      title: "⚠️ 全員強制利益確定",
      message: "まだ確定していない行動中の全エージェントを終了状態にします。\n実行する場合は「FINISH」と入力してください。",
      variant: "danger",
      placeholder: "FINISH"
    });
    if (normalizeConfirmWord(word) === "FINISH") {
      setDangerAction("finalize");
      try {
        const users = await refreshUsers();
        await forceFinalizeAll(users || allUsers, stocks);
        await refreshUsers();
      } finally {
        setDangerAction(null);
      }
    } else if (word) {
      await alert({ title: "中止しました", message: "確認ワードが一致しなかったため実行しませんでした。", variant: "warning" });
    }
  };

  const handleResetForNextDay = async () => {
    const word = await prompt({
      title: "⚠️ 翌日のための全リセット",
      message: `全エージェントのデータが初期化され、ポイントは ${currentInitialPoint} pt、コースはTRADERに戻ります。\nこの操作は取り消せません。\n実行する場合は「RESET」と入力してください。`,
      variant: "danger",
      placeholder: "RESET"
    });
    if (normalizeConfirmWord(word) === "RESET") {
      setDangerAction("reset");
      try {
        const users = await refreshUsers();
        await resetAllUsersForNextDay(users || allUsers, currentInitialPoint);
        await refreshUsers();
      } finally {
        setDangerAction(null);
      }
    } else if (word) {
      await alert({ title: "中止しました", message: "確認ワードが一致しなかったため実行しませんでした。", variant: "warning" });
    }
  };

  const handleInfoPageToggle = async (checked: boolean) => {
    const previous = showInfoPageOnLogin;
    setShowInfoPageOnLogin(checked);
    try {
      await setDoc(doc(db, "settings", "system"), { showInfoPageOnLogin: checked }, { merge: true });
    } catch (error) {
      setShowInfoPageOnLogin(previous);
      await alert({ title: "保存失敗", message: error instanceof Error ? error.message : "Helpタブの表示設定を保存できませんでした。", variant: "danger" });
    }
  };

  const [forcingReload, setForcingReload] = useState(false);

  const handleForceReloadAll = async () => {
    const ok = await confirm({
      title: "全端末に再読み込みを促しますか？",
      message: "サイネージ画面を除く、開いたままの端末（古いタブ・スマホなど）が自動でキャッシュクリア＋再読み込みされます。取引中の操作が終わり次第、順次反映されます。",
      variant: "warning",
    });
    if (!ok) return;

    setForcingReload(true);
    try {
      await setDoc(doc(db, "settings", "system"), { clientVersion: `manual-${Date.now()}` }, { merge: true });
      await alert({ title: "送信しました", message: "接続中の端末（サイネージ除く）に再読み込みを促しました。", variant: "success" });
    } catch (error) {
      await alert({ title: "送信失敗", message: error instanceof Error ? error.message : "再読み込みの通知を送信できませんでした。", variant: "danger" });
    } finally {
      setForcingReload(false);
    }
  };

  const handleEcoModeToggle = async (checked: boolean) => {
    const previous = ecoMode;
    setEcoMode(checked);
    try {
      await setDoc(doc(db, "settings", "system"), { ecoMode: checked }, { merge: true });
    } catch (error) {
      setEcoMode(previous);
      await alert({ title: "保存失敗", message: error instanceof Error ? error.message : "省エネモード設定を保存できませんでした。", variant: "danger" });
    }
  };

  const handleInfoMarkdownSave = async () => {
    const markdown = editingInfoMarkdown.trim();
    if (!markdown) {
      await alert({ title: "保存できません", message: "Help本文を入力してください。", variant: "warning" });
      return;
    }

    setSavingInfoMarkdown(true);
    try {
      await setDoc(doc(db, "settings", "system"), { infoPageMarkdown: markdown }, { merge: true });
      setOriginalInfoMarkdown(markdown);
      setEditingInfoMarkdown(markdown);
      await alert({ title: "保存完了", message: "説明本文を保存しました。取引画面のHelpタブに即時反映されます。", variant: "success" });
    } catch (error) {
      await alert({ title: "保存失敗", message: error instanceof Error ? error.message : "Help本文を保存できませんでした。", variant: "danger" });
    } finally {
      setSavingInfoMarkdown(false);
    }
  };

  const handleQuantityPresetSave = async () => {
    const normalized = normalizeTradeQuantityPresets(editingQuantityPresets);
    if (normalized.length === 0 || normalized.length !== editingQuantityPresets.filter(value => isPositiveIntegerInput(value)).length) {
      await alert({ title: "保存できません", message: "数量プリセットには1以上の整数を入力してください。", variant: "warning" });
      return;
    }
    setSavingQuantityPresets(true);
    try {
      await setDoc(doc(db, "settings", "system"), { tradeQuantityPresets: normalized }, { merge: true });
      setOriginalQuantityPresets(normalized);
      setEditingQuantityPresets(normalized);
      await alert({ title: "保存完了", message: "すべての取引画面・証券窓口に反映しました。", variant: "success" });
    } catch (error) {
      await alert({ title: "保存失敗", message: error instanceof Error ? error.message : "数量プリセットを保存できませんでした。", variant: "danger" });
    } finally {
      setSavingQuantityPresets(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full pb-32">
      <UnsavedBar hasChanges={hasChanges} onSave={handleSave} onReset={handleReset} />

      <div className="mb-8">
        <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
          <Settings className="text-slate-500" /> クロージング・システム設定
        </h2>
        <p className="text-slate-500 text-sm mt-1">景品の設定や、1日の終わりの集計・リセットを行います。</p>
      </div>

      <Tabs className="mb-6 border-slate-200 dark:border-slate-800">
        {[
          { id: "closing", label: "クロージング", icon: <AlertTriangle size={16} /> },
          { id: "info", label: "Help本文", icon: <FileText size={16} /> },
          { id: "prizes", label: "景品", icon: <Gift size={16} /> },
          { id: "quantities", label: "数量プリセット", icon: <Calculator size={16} /> },
          { id: "admins", label: "管理者", icon: <ShieldCheck size={16} /> }
        ].map(tab => (
          <TabButton
            key={tab.id}
            value={tab.id as "closing" | "info" | "prizes" | "quantities" | "admins"}
            activeValue={activeTab}
            onSelect={setActiveTab}
            tone="blue"
            icon={tab.icon}
            className="px-4 py-3 text-sm"
          >
            {tab.label}
          </TabButton>
        ))}
      </Tabs>

      {activeTab === "prizes" && (
        <div className="font-sans">
          <PrizeSettingsCard
            editingPrizes={editingPrizes}
            setEditingPrizes={setEditingPrizes}
            onSave={handleSave}
            hasChanges={hasChanges}
          />
        </div>
      )}

      {activeTab === "admins" && (
        <div className="font-sans">
          <AdminManagerCard
            adminsList={adminsList}
            currentUserRole={currentUserRole}
            newAdminEmail={newAdminEmail}
            setNewAdminEmail={setNewAdminEmail}
            addingAdmin={addingAdmin}
            onAddAdmin={handleAddAdmin}
            onDeleteAdmin={handleDeleteAdmin}
            onRoleChange={handleRoleChange}
          />
        </div>
      )}

      {activeTab === "quantities" && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calculator size={20} /> 取引数量プリセット</CardTitle>
            <p className="text-slate-500 text-xs">生徒用の取引画面と証券窓口に、共通の数量ボタンとして表示されます。</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {editingQuantityPresets.map((preset, index) => (
                <label key={index} className="space-y-1 text-xs font-black text-slate-500">
                  {index + 1}番目
                  <input
                    value={preset}
                    inputMode="numeric"
                    onChange={event => setEditingQuantityPresets(current => current.map((value, itemIndex) => itemIndex === index ? event.target.value.replace(/[^0-9]/g, "") : value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center font-mono text-lg font-black text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={editingQuantityPresets.length >= 8} onClick={() => setEditingQuantityPresets(current => [...current, ""])}>追加</Button>
              <Button variant="outline" disabled={editingQuantityPresets.length <= 1} onClick={() => setEditingQuantityPresets(current => current.slice(0, -1))}>最後を削除</Button>
              <Button variant="outline" onClick={() => setEditingQuantityPresets(originalQuantityPresets)}>戻す</Button>
            </div>
            <Button className="w-full" disabled={savingQuantityPresets || JSON.stringify(editingQuantityPresets) === JSON.stringify(originalQuantityPresets)} isLoading={savingQuantityPresets} onClick={handleQuantityPresetSave}><Save size={16} className="mr-2" /> 全体に保存</Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "info" && (
        <div className="grid grid-cols-1 gap-6 font-sans xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText size={20} /> Help本文</CardTitle>
              <p className="text-slate-500 text-xs">取引画面のHelpタブに表示する本文をMarkdownで編集します。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={editingInfoMarkdown}
                onChange={e => setEditingInfoMarkdown(e.target.value)}
                className="min-h-[520px] font-mono text-sm leading-6"
                spellCheck={false}
                aria-label="Help Markdown本文"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-bold text-on-surface-variant">
                  見出しは # / ##、箇条書きは - または ・、太字は **文字** が使えます。
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={!hasInfoChanges || savingInfoMarkdown} onClick={() => setEditingInfoMarkdown(originalInfoMarkdown)}>
                    <RotateCcw size={16} className="mr-2" /> 戻す
                  </Button>
                  <Button disabled={!hasInfoChanges} isLoading={savingInfoMarkdown} onClick={handleInfoMarkdownSave}>
                    <Save size={16} className="mr-2" /> 保存
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>プレビュー</CardTitle>
              <p className="text-slate-500 text-xs">取引画面のHelpタブと同じ本文レンダリングで確認できます。</p>
            </CardHeader>
            <CardContent>
              <MarkdownContent
                markdown={editingInfoMarkdown}
                className="space-y-5 rounded-lg border border-outline-variant bg-surface-container p-5 text-sm font-bold leading-8 text-on-surface-variant"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "closing" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 font-sans">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Smartphone size={20} /> ログイン後の表示</CardTitle>
              <p className="text-slate-500 text-xs">ログイン後に、取引画面のHelpタブを最初に表示します。</p>
            </CardHeader>
            <CardContent>
              <label className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container p-4">
                <span>
                  <span className="block text-sm font-black">ログイン後にHelpタブを表示</span>
                  <span className="text-xs font-bold text-on-surface-variant">OFFにすると従来通り取引画面へ移動します。</span>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-cyan-500"
                  checked={showInfoPageOnLogin}
                  onChange={e => handleInfoPageToggle(e.target.checked)}
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Leaf size={20} /> 省エネモード（家庭用）</CardTitle>
              <p className="text-slate-500 text-xs">学校祭終了後に少人数で続けるときのFirestore節約モード。ONでもクライアント側で株価は10秒ごとに変動し続けます。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container p-4">
                <span>
                  <span className="block text-sm font-black">省エネモードを有効にする</span>
                  <span className="text-xs font-bold text-on-surface-variant">ONの間はランキングを数分ごとに更新し、株価エンジンの書き込みを間引きます。学校祭本番はOFFにしてください。</span>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-emerald-500"
                  checked={ecoMode}
                  onChange={e => handleEcoModeToggle(e.target.checked)}
                />
              </label>
              <Button
                variant="secondary"
                className="w-full py-4"
                disabled={forcingReload}
                onClick={handleForceReloadAll}
              >
                <RotateCcw size={18} className="mr-2" /> 開きっぱなしの端末に再読み込みを促す
              </Button>
              <p className="text-xs font-bold text-on-surface-variant">
                古いタブ・スマホが開いたままだと、値動きの更新のたびにその端末の分だけ読み取り課金が発生します。使っていない画面があれば閉じるか、これで再読み込みさせてください（サイネージ画面は対象外）。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ランキング集計</CardTitle>
              <p className="text-slate-500 text-xs">現在の全エージェントの順位・ポイントをCSV形式でダウンロードします。</p>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" className="w-full py-4" onClick={exportRankingCSV}>
                <Download size={18} className="mr-2" /> CSVダウンロード
              </Button>
            </CardContent>
          </Card>

          <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2"><AlertTriangle size={20} /> 危険な操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-red-100 dark:border-red-900/30">
                <h4 className="font-bold text-slate-800 dark:text-white mb-1">全員強制利益確定</h4>
                <p className="text-xs text-slate-500 mb-3">まだ確定していない行動中の全エージェントを終了状態にします。</p>
                <Button variant="danger" className="w-full" isLoading={dangerAction === "finalize"} disabled={dangerAction !== null} onClick={handleForceFinalize}>強制確定する</Button>
              </div>
              <div className="bg-slate-900 dark:bg-black p-5 rounded-xl border border-slate-800">
                <h4 className="font-bold text-red-400 mb-1">翌日のための全リセット</h4>
                <p className="text-xs text-slate-400 mb-3">全データを初期状態に戻します。2日目の朝に実行してください。</p>
                <Button variant="danger" className="w-full" isLoading={dangerAction === "reset"} disabled={dangerAction !== null} onClick={handleResetForNextDay}>全データ初期化</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
