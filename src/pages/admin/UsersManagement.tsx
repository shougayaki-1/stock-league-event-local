// src/pages/admin/UsersManagement.tsx

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, onSnapshot, query, orderBy, doc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useUserActions } from "../../hooks/useUserActions";
import type { User, Stock } from "../../types/domain";
import { Printer, Users, Save, Coins, FileText, ClipboardList, Download, Trash2, RefreshCw } from "lucide-react";
import QRCodeLib from "react-qr-code";
import { downloadUsersCsv } from "../../lib/exportUsersCsv";

import Button from "../../components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import UserPrintPreview from "../../components/admin/UserPrintPreview";
import OrderBoardPrintPreview from "../../components/admin/OrderBoardPrintPreview";
import { formatExact, isPositiveIntegerInput, toExactString } from "../../lib/exactNumber";
import { buildLoginQrUrl } from "../../lib/utils";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

const QRCode = (QRCodeLib as unknown as { default: React.ElementType }).default || QRCodeLib;

export default function UsersManagement() {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [qrModalUser, setQrModalUser] = useState<User | null>(null);

  const [genCount, setGenCount] = useState(20);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printIds, setPrintIds] = useState<string[]>([]);
  const [isBoardPrintMode, setIsBoardPrintMode] = useState(false);
  const [boardPrintUsers, setBoardPrintUsers] = useState<User[]>([]);
  const [searchText, setSearchText] = useState("");
  const [courseFilter, setCourseFilter] = useState<"ALL" | "TRADER" | "INSIDER" | "UNREGISTERED">("ALL");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingPoint, setIsSavingPoint] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);

  const { bulkGenerateUsers, bulkUpdateStatus, saveInitialSettings, deleteUsers } = useUserActions();
  useBodyScrollLock(Boolean(qrModalUser));

  const [initialPoint, setInitialPoint] = useState("1000");
  const [isPointChanged, setIsPointChanged] = useState(false);
  type HoldingRow = { stockId: string; amount: string };
  const [holdingRows, setHoldingRows] = useState<HoldingRow[]>([]);

  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);

  // 生徒一覧はusersコレクション全件(数百〜千件規模)を読み込むため、常時onSnapshotで
  // 接続し続けるとページの再読み込み・再接続のたびに全件読み取りが発生してしまう。
  // ここは手動更新ボタンでの都度取得に変え、無駄な再読み込みコストを避ける。
  const refreshUsers = useCallback(async () => {
    setIsRefreshingUsers(true);
    try {
      const snap = await getDocs(query(collection(db, "users"), orderBy("shortId", "asc")));
      setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as User)));
    } finally {
      setIsRefreshingUsers(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void refreshUsers(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshUsers]);

  useEffect(() => {
    const unsubSys = onSnapshot(doc(db, "settings", "system"), (snap) => {
      if (snap.exists() && snap.data().initialPoint !== undefined) {
        setInitialPoint(toExactString(snap.data().initialPoint));
        setIsPointChanged(false);
      }
      if (snap.exists()) {
        const holdings = (snap.data().initialHoldings || {}) as Record<string, string>;
        setHoldingRows(Object.entries(holdings).map(([stockId, amount]) => ({ stockId, amount: String(amount) })));
      }
    });

    const unsubStocks = onSnapshot(collection(db, "stocks"), (snap) => {
      setStocks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Stock)));
    });

    return () => { unsubSys(); unsubStocks(); };
  }, []);

  useEffect(() => {
    if (!qrModalUser) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQrModalUser(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [qrModalUser]);

  const handleGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const holdingsMap = Object.fromEntries(
        holdingRows
          .filter(row => row.stockId && isPositiveIntegerInput(row.amount))
          .map(row => [row.stockId, toExactString(row.amount)])
      );
      const ids = await bulkGenerateUsers(genCount, initialPoint, holdingsMap);
      if (ids) {
        setPrintIds(ids);
        setIsPrintMode(true);
        void refreshUsers();
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintSelected = () => {
    if (selectedUids.length === 0) return;
    const loginIds = selectedUids.map(uid => {
      const user = allUsers.find(u => u.uid === uid);
      return user?.email ? user.email.split('@')[0] : uid;
    });
    setPrintIds(loginIds);
    setIsPrintMode(true);
  };

  const handleExportCsv = async () => {
    const stocksSnap = await getDocs(collection(db, "stocks"));
    const stocks = stocksSnap.docs.map(d => d.data() as Stock);
    downloadUsersCsv(allUsers, stocks);
  };

  const handlePrintOrderBoards = () => {
    if (selectedUids.length === 0) return;
    const users = selectedUids
      .map(uid => allUsers.find(u => u.uid === uid))
      .filter((u): u is User => Boolean(u));
    setBoardPrintUsers(users);
    setIsBoardPrintMode(true);
  };

  const handleAddHoldingRow = () => {
    setHoldingRows(prev => [...prev, { stockId: "", amount: "" }]);
    setIsPointChanged(true);
  };

  const handleRemoveHoldingRow = (index: number) => {
    setHoldingRows(prev => prev.filter((_, i) => i !== index));
    setIsPointChanged(true);
  };

  const handleUpdateHoldingRow = (index: number, field: keyof HoldingRow, value: string) => {
    setHoldingRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
    setIsPointChanged(true);
  };

  const handleSavePoint = async () => {
    if (isSavingPoint) return;
    setIsSavingPoint(true);
    try {
      if (await saveInitialSettings(initialPoint, holdingRows)) setIsPointChanged(false);
    } finally {
      setIsSavingPoint(false);
    }
  };

  const filteredUsers = useMemo(() => allUsers.filter(user => {
    const needle = searchText.trim().toLowerCase();
    const matchesText = !needle ||
      (user.shortId || "").toLowerCase().includes(needle) ||
      (user.nickname || "").toLowerCase().includes(needle);
    const matchesCourse = courseFilter === "ALL"
      || (courseFilter === "UNREGISTERED" ? !user.nickname : user.courseType === courseFilter);
    return matchesText && matchesCourse;
  }), [allUsers, courseFilter, searchText]);

  const selectedUidSet = useMemo(() => new Set(selectedUids), [selectedUids]);

  const rangeUsers = useMemo(() => {
    const start = Number.parseInt(rangeStart, 10);
    const end = Number.parseInt(rangeEnd, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    return allUsers.filter(user => {
      const shortIdNo = Number.parseInt(user.shortId, 10);
      return Number.isFinite(shortIdNo) && shortIdNo >= min && shortIdNo <= max;
    });
  }, [allUsers, rangeEnd, rangeStart]);

  const rangeUids = useMemo(() => rangeUsers.map(user => user.uid), [rangeUsers]);
  const hasValidRange = rangeStart.trim() !== "" && rangeEnd.trim() !== "" && rangeUsers.length > 0;

  const toggleSelectAll = () => {
    const visibleIds = filteredUsers.map(u => u.uid);
    if (visibleIds.length > 0 && visibleIds.every(uid => selectedUidSet.has(uid))) {
      setSelectedUids(prev => prev.filter(uid => !visibleIds.includes(uid)));
    } else {
      setSelectedUids(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };
  const toggleSelectUser = (uid: string) => {
    setSelectedUids(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleUpdate = async (field: "courseType" | "isFinished", value: string | boolean) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const success = await bulkUpdateStatus(selectedUids, field, value);
      if (success) {
        setSelectedUids([]);
        void refreshUsers();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRangeSelect = () => {
    if (!hasValidRange) return;
    setSelectedUids(prev => Array.from(new Set([...prev, ...rangeUids])));
  };

  const handleRangeUpdate = async (field: "courseType" | "isFinished", value: string | boolean) => {
    if (!hasValidRange || isUpdating) return;
    setIsUpdating(true);
    try {
      const success = await bulkUpdateStatus(rangeUids, field, value);
      if (success) {
        setSelectedUids(prev => prev.filter(uid => !rangeUids.includes(uid)));
        void refreshUsers();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (uids: string[]) => {
    if (isDeleting || uids.length === 0) return;
    setIsDeleting(true);
    try {
      const success = await deleteUsers(uids);
      if (success) {
        setSelectedUids(prev => prev.filter(uid => !uids.includes(uid)));
        void refreshUsers();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // IDカード印刷プレビューのレンダリング
  if (isPrintMode) {
    return (
      <UserPrintPreview
        printIds={printIds}
        onBack={() => setIsPrintMode(false)}
      />
    );
  }

  // 注文台紙印刷プレビューのレンダリング
  if (isBoardPrintMode) {
    return (
      <OrderBoardPrintPreview
        printUsers={boardPrintUsers}
        onBack={() => setIsBoardPrintMode(false)}
      />
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1700px] mx-auto w-full pb-32">
      {qrModalUser && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setQrModalUser(null)}>
          <Card className="max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <CardContent className="pt-8">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-1">{qrModalUser.nickname || "未登録"}</h3>
              <p className="text-slate-500 font-mono text-sm mb-6">ID: {qrModalUser.shortId}</p>
              {(() => {
                const loginId = qrModalUser.email ? qrModalUser.email.split('@')[0] : qrModalUser.uid;
                const loginUrl = buildLoginQrUrl(loginId);
                return (
                  <>
                    <div className="bg-white p-4 border border-slate-100 rounded-2xl inline-block mb-6 shadow-inner">
                      <QRCode value={loginUrl} size={200} />
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono mb-4 break-all bg-slate-50 p-2 rounded-lg">
                      {loginUrl}
                    </p>
                  </>
                );
              })()}
              <Button variant="secondary" className="w-full" onClick={() => setQrModalUser(null)}>閉じる</Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2"><Users className="text-indigo-500" /> ID発行・ステータス管理</h2>
        <p className="text-slate-500 text-sm mt-1">ここで発行されたIDは、すべて「TRADERコース」として初期化されます。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6 sticky top-8 h-fit">

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Printer size={18} /> ID一括発行</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Input type="number" min="1" max="200" label="発行枚数" value={genCount} onChange={e => setGenCount(Number(e.target.value))} />
              <p className="text-[10px] text-slate-400 font-bold bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">IDは現在の最大番号から自動で連番採番されます。</p>
              <Button className="w-full py-4 shadow-lg shadow-indigo-500/20" isLoading={isGenerating} disabled={isGenerating} onClick={handleGenerate}>QRコードを自動生成する</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Coins size={18} className="text-amber-500" /> 初期ポイント・初期保有株設定</CardTitle>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-1">ID発行時や、スマホで自己登録した際に付与される初期の軍資金です（初期保有株はID一括発行時のみ付与されます）。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <Input type="text" inputMode="numeric" pattern="[0-9]*" value={initialPoint} onChange={e => { setInitialPoint(e.target.value); setIsPointChanged(true); }} className="font-mono text-xl font-black text-blue-600" />
              </div>
              {!isPositiveIntegerInput(initialPoint) && <p className="text-xs font-bold text-red-500">1以上の整数を入力してください。</p>}

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-bold text-slate-500">初期保有株</p>
                {holdingRows.map((row, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <select
                      value={row.stockId}
                      onChange={e => handleUpdateHoldingRow(index, "stockId", e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">銘柄を選択</option>
                      {stocks.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="株数"
                      value={row.amount}
                      onChange={e => handleUpdateHoldingRow(index, "amount", e.target.value)}
                      className="w-24"
                    />
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveHoldingRow(index)}>
                      <Trash2 size={16} className="text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button variant="secondary" size="sm" onClick={handleAddHoldingRow}>+ 銘柄を追加</Button>
              </div>

              <Button variant={isPointChanged ? "primary" : "secondary"} className="w-full h-[46px]" isLoading={isSavingPoint} disabled={!isPointChanged || isSavingPoint} onClick={handleSavePoint}>
                <Save size={16} className="mr-1" /> 保存
              </Button>
            </CardContent>
          </Card>

        </div>

        <Card className="lg:col-span-2 flex flex-col h-[75vh] min-w-0">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-bold text-slate-400 mr-2">✓ 選択中: <span className="text-indigo-600 dark:text-indigo-400">{selectedUids.length}名</span></span>

            <Button variant="secondary" size="sm" onClick={refreshUsers} isLoading={isRefreshingUsers} disabled={isRefreshingUsers} className="bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-white">
              <RefreshCw size={14} className="mr-1" /> 一覧を更新
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={allUsers.length === 0} className="bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-white">
              <Download size={14} className="mr-1" /> 所持金・所持株をCSV出力
            </Button>
            <Button variant="secondary" size="sm" onClick={handlePrintSelected} disabled={selectedUids.length === 0} className="bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-white">
              <FileText size={14} className="mr-1" /> IDカードを印刷
            </Button>
            <Button variant="secondary" size="sm" onClick={handlePrintOrderBoards} disabled={selectedUids.length === 0} className="bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-white">
              <ClipboardList size={14} className="mr-1" /> 注文台紙を印刷
            </Button>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <Button variant="ghost" size="sm" onClick={() => handleUpdate("courseType", "TRADER")} disabled={selectedUids.length === 0 || isUpdating}>TRADERへ</Button>
            <Button variant="ghost" size="sm" onClick={() => handleUpdate("courseType", "INSIDER")} disabled={selectedUids.length === 0 || isUpdating}>INSIDERへ</Button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <Button variant="ghost" size="sm" onClick={() => handleUpdate("isFinished", false)} disabled={selectedUids.length === 0 || isUpdating}>行動中へ</Button>
            <Button variant="ghost" size="sm" onClick={() => handleUpdate("isFinished", true)} disabled={selectedUids.length === 0 || isUpdating}>確定済へ</Button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <Button variant="danger" size="sm" onClick={() => handleDelete(selectedUids)} disabled={selectedUids.length === 0 || isDeleting}>
              <Trash2 size={14} className="mr-1" /> 選択したユーザーを削除
            </Button>
            <div className="w-full flex flex-col sm:flex-row gap-2 pt-2">
              <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="ID・名前で検索" className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900" />
              <select value={courseFilter} onChange={e => setCourseFilter(e.target.value as typeof courseFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-900">
                <option value="ALL">全員</option>
                <option value="UNREGISTERED">未登録のみ</option>
                <option value="TRADER">TRADERのみ</option>
                <option value="INSIDER">INSIDERのみ</option>
              </select>
              <span className="self-center text-xs font-bold text-slate-400">{filteredUsers.length} / {allUsers.length}名</span>
            </div>
            <div className="w-full flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/70">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xs font-black text-slate-500 shrink-0">番号範囲</span>
                <input
                  value={rangeStart}
                  onChange={e => setRangeStart(e.target.value)}
                  inputMode="numeric"
                  placeholder="開始 ID"
                  className="w-full sm:w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-black outline-none dark:border-slate-700 dark:bg-slate-950"
                />
                <span className="hidden sm:inline text-xs font-bold text-slate-400">〜</span>
                <input
                  value={rangeEnd}
                  onChange={e => setRangeEnd(e.target.value)}
                  inputMode="numeric"
                  placeholder="終了 ID"
                  className="w-full sm:w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-black outline-none dark:border-slate-700 dark:bg-slate-950"
                />
                <span className="text-xs font-bold text-slate-400 shrink-0">
                  対象: <span className="text-indigo-600 dark:text-indigo-400">{rangeUsers.length}</span>名
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleRangeSelect} disabled={!hasValidRange}>範囲を選択</Button>
                <Button variant="ghost" size="sm" onClick={() => handleRangeUpdate("courseType", "TRADER")} disabled={!hasValidRange || isUpdating}>範囲をTRADERへ</Button>
                <Button variant="ghost" size="sm" onClick={() => handleRangeUpdate("courseType", "INSIDER")} disabled={!hasValidRange || isUpdating}>範囲をINSIDERへ</Button>
                <Button variant="ghost" size="sm" onClick={() => handleRangeUpdate("isFinished", false)} disabled={!hasValidRange || isUpdating}>範囲を行動中へ</Button>
                <Button variant="ghost" size="sm" onClick={() => handleRangeUpdate("isFinished", true)} disabled={!hasValidRange || isUpdating}>範囲を確定済へ</Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(rangeUids)} disabled={!hasValidRange || isDeleting}>
                  <Trash2 size={14} className="mr-1" /> 範囲を削除
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-4 w-12 text-center"><input type="checkbox" checked={filteredUsers.length > 0 && filteredUsers.every(u => selectedUidSet.has(u.uid))} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-indigo-500" /></th>
                  <th className="p-4">ID</th><th className="p-4">名前</th><th className="p-4 text-right">資産</th><th className="p-4 text-center">コース</th><th className="p-4 text-center">状態</th><th className="p-4 text-center">QR</th><th className="p-4 text-center">削除</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map(u => (
                  <tr key={u.uid} className={`transition-colors ${selectedUidSet.has(u.uid) ? "bg-indigo-50/30 dark:bg-indigo-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/30"}`}>
                    <td className="p-4 text-center"><input type="checkbox" checked={selectedUidSet.has(u.uid)} onChange={() => toggleSelectUser(u.uid)} className="w-4 h-4 rounded accent-indigo-500" /></td>
                    <td className="p-4 font-mono text-xs text-slate-400">{u.shortId}</td>
                    <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{u.nickname || "未登録"}</td>
                    <td className="p-4 font-mono font-bold text-blue-600 dark:text-blue-400 text-right">{formatExact(u.points)}</td>
                    <td className="p-4 text-center"><Badge variant={u.courseType === "INSIDER" ? "danger" : "info"}>{u.courseType}</Badge></td>
                    <td className="p-4 text-center"><Badge variant={u.isFinished ? "warning" : "success"}>{u.isFinished ? "確定済" : "行動中"}</Badge></td>
                    <td className="p-4 text-center"><Button variant="ghost" size="sm" className="text-indigo-600 underline font-bold" onClick={() => setQrModalUser(u)}>表示</Button></td>
                    <td className="p-4 text-center">
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete([u.uid])} disabled={isDeleting}>
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && <p className="py-10 text-center text-sm font-black text-slate-400">該当するユーザーがいません。</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
