import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, addDoc, doc, deleteDoc, writeBatch, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Plus, Trash2, Tv, MapPin, Info, ExternalLink, ChevronDown, ChevronUp, BellRing, BellOff, MonitorPlay, RotateCcw, Cloud, Megaphone, Play, Sun, Moon, PlaySquare } from "lucide-react";
import UnsavedBar from "../../components/admin/UnsavedBar";

import Button from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import SegmentedControl from "../../components/ui/SegmentedControl";
import { useDialog } from "../../contexts/DialogContext";
import ScreenMockup from "../../components/ui/ScreenMockup"; // 追加
import { PUBLIC_SIGNAGE_PRESETS as PRESETS, type PlaylistItem } from "../../lib/signagePresets";
import { formatVideoBytes, getOptimizedStatusLabel, getPreferredVideoAsset, type CloudVideoAsset } from "../../lib/cloudVideos";
import { VIDEO_LIBRARY_COLLECTION, type VideoLibraryItem } from "../../types/videoLibrary";
import { VIDEO_GROUPS_COLLECTION, type VideoGroup } from "../../types/videoGroup";
import VideoPickerModal from "../../components/admin/video/VideoPickerModal";
import { IMAGE_LIBRARY_COLLECTION, type ImageLibraryItem } from "../../types/imageLibrary";
import VideoPreviewModal, { VideoAssetActions } from "../../components/admin/video/VideoPreviewModal";
import ImagePreviewModal from "../../components/admin/image/ImagePreviewModal";
import PlaylistItemsEditor from "../../components/admin/signage/PlaylistItemsEditor";
import { PLAYLIST_TIMING } from "../../lib/appConstants";
import { DEFAULT_SIGNAGE_THEME, parseSignageTheme, type SignageTheme } from "../../lib/riddleConstants";
import { FIRESTORE_COLLECTIONS } from "../../lib/firestorePaths";
import type { SignagePlaylist } from "../../types/signagePlaylist";
import type { CloudImageAsset } from "../../lib/cloudImages";

interface ManualOverride {
  mode: string;
  videoAssetId?: string | null;
  kind?: "NORMAL" | "AD";
}

interface PublicSignageDevice {
  id: string;
  name: string;
  location: string;
  allowInterrupt: boolean;
  playlist: PlaylistItem[];
  theme: SignageTheme;
  liveMode?: string | null;
  manualOverride?: ManualOverride | null;
  manualPlaylist?: PlaylistItem[] | null;
  manualPlaylistName?: string | null;
}

const DEFAULT_PLAYLIST: PlaylistItem[] = [{ mode: "STOCK_GRID", duration: 30 }];
const MIN_PLAYLIST_DURATION_SECONDS = PLAYLIST_TIMING.minDurationSeconds;

const clonePlaylists = (playlists: Record<string, PlaylistItem[]>) => JSON.parse(JSON.stringify(playlists)) as Record<string, PlaylistItem[]>;

const buildSignageState = (devices: PublicSignageDevice[]) => {
  const playlists: Record<string, PlaylistItem[]> = {};
  const interrupts: Record<string, boolean> = {};
  const themes: Record<string, SignageTheme> = {};
  devices.forEach(device => {
    playlists[device.id] = device.playlist || [];
    interrupts[device.id] = device.allowInterrupt ?? true;
    themes[device.id] = device.theme || DEFAULT_SIGNAGE_THEME;
  });
  return { playlists, interrupts, themes };
};

export default function PublicSignageManage() {
  const [signages, setSignages] = useState<PublicSignageDevice[]>([]);
  const [activeSignageId, setActiveSignageId] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("廊下");
  const [isSaving, setIsSaving] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [originalPlaylists, setOriginalPlaylists] = useState<Record<string, PlaylistItem[]>>({});
  const [editingPlaylists, setEditingPlaylists] = useState<Record<string, PlaylistItem[]>>({});
  const [originalInterrupts, setOriginalInterrupts] = useState<Record<string, boolean>>({});
  const [editingInterrupts, setEditingInterrupts] = useState<Record<string, boolean>>({});
  const [originalThemes, setOriginalThemes] = useState<Record<string, SignageTheme>>({});
  const [editingThemes, setEditingThemes] = useState<Record<string, SignageTheme>>({});
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [imageLibrary, setImageLibrary] = useState<ImageLibraryItem[]>([]);
  const [signagePlaylists, setSignagePlaylists] = useState<SignagePlaylist[]>([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Record<string, string>>({});
  const [selectedManualVideoIds, setSelectedManualVideoIds] = useState<Record<string, string>>({});
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [isVideoPickerOpen, setIsVideoPickerOpen] = useState(false);
  const [preview, setPreview] = useState<{ asset: CloudVideoAsset; title: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<{ asset: CloudImageAsset; title: string } | null>(null);
  const originalPlaylistsRef = useRef(originalPlaylists);
  const editingPlaylistsRef = useRef(editingPlaylists);
  const originalInterruptsRef = useRef(originalInterrupts);
  const editingInterruptsRef = useRef(editingInterrupts);
  const originalThemesRef = useRef(originalThemes);
  const editingThemesRef = useRef(editingThemes);

  const { alert, confirm } = useDialog();

  useEffect(() => { originalPlaylistsRef.current = originalPlaylists; }, [originalPlaylists]);
  useEffect(() => { editingPlaylistsRef.current = editingPlaylists; }, [editingPlaylists]);
  useEffect(() => { originalInterruptsRef.current = originalInterrupts; }, [originalInterrupts]);
  useEffect(() => { editingInterruptsRef.current = editingInterrupts; }, [editingInterrupts]);
  useEffect(() => { originalThemesRef.current = originalThemes; }, [originalThemes]);
  useEffect(() => { editingThemesRef.current = editingThemes; }, [editingThemes]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "public_signages"), (snap) => {
      const data = snap.docs.map(d => {
        const signageData = d.data();
        return {
          id: d.id,
          name: signageData.name || "",
          location: signageData.location || "",
          allowInterrupt: signageData.allowInterrupt ?? true,
          playlist: signageData.playlist || [],
          theme: parseSignageTheme(signageData.theme),
          liveMode: typeof signageData.liveMode === "string" ? signageData.liveMode : null,
          manualOverride: signageData.manualOverride || null,
          manualPlaylist: Array.isArray(signageData.manualPlaylist) && signageData.manualPlaylist.length > 0 ? signageData.manualPlaylist : null,
          manualPlaylistName: typeof signageData.manualPlaylistName === "string" ? signageData.manualPlaylistName : null,
        } as PublicSignageDevice;
      });
      const { playlists: nextPlaylists, interrupts: nextInterrupts, themes: nextThemes } = buildSignageState(data);
      const editingMatchesOriginal =
        JSON.stringify(editingPlaylistsRef.current) === JSON.stringify(originalPlaylistsRef.current) &&
        JSON.stringify(editingInterruptsRef.current) === JSON.stringify(originalInterruptsRef.current) &&
        JSON.stringify(editingThemesRef.current) === JSON.stringify(originalThemesRef.current);

      setSignages(data);
      setOriginalPlaylists(clonePlaylists(nextPlaylists));
      setOriginalInterrupts(nextInterrupts);
      setOriginalThemes(nextThemes);
      setEditingPlaylists(prev => {
        if (editingMatchesOriginal || Object.keys(prev).length === 0) return clonePlaylists(nextPlaylists);
        return Object.fromEntries(data.map(device => [device.id, prev[device.id] || nextPlaylists[device.id] || []]));
      });
      setEditingInterrupts(prev => {
        if (editingMatchesOriginal || Object.keys(prev).length === 0) return nextInterrupts;
        return Object.fromEntries(data.map(device => [device.id, prev[device.id] ?? nextInterrupts[device.id] ?? true]));
      });
      setEditingThemes(prev => {
        if (editingMatchesOriginal || Object.keys(prev).length === 0) return nextThemes;
        return Object.fromEntries(data.map(device => [device.id, prev[device.id] ?? nextThemes[device.id] ?? DEFAULT_SIGNAGE_THEME]));
      });
      setSelectedManualVideoIds(prev => Object.fromEntries(data.map(device => [device.id, prev[device.id] || ""])));
      setActiveSignageId(prev => (data.some(device => device.id === prev) ? prev : data[0]?.id || ""));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, VIDEO_LIBRARY_COLLECTION), (snap) => {
      setVideoLibrary(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoLibraryItem)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, VIDEO_GROUPS_COLLECTION), (snap) => {
      setVideoGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoGroup)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, IMAGE_LIBRARY_COLLECTION), (snap) => {
      setImageLibrary(snap.docs.map(d => ({ id: d.id, ...d.data() } as ImageLibraryItem)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, FIRESTORE_COLLECTIONS.signagePlaylists), (snap) => {
      setSignagePlaylists(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignagePlaylist)));
    });
    return () => unsub();
  }, []);

  const hasChanges =
    JSON.stringify(editingPlaylists) !== JSON.stringify(originalPlaylists) ||
    JSON.stringify(editingInterrupts) !== JSON.stringify(originalInterrupts) ||
    JSON.stringify(editingThemes) !== JSON.stringify(originalThemes);

  const handleReset = () => {
    setEditingPlaylists(clonePlaylists(originalPlaylists));
    setEditingInterrupts(originalInterrupts);
    setEditingThemes(originalThemes);
  };

  const handleSave = async () => {
    const invalidItems: string[] = [];
    signages.forEach(sig => {
      (editingPlaylists[sig.id] || []).forEach((item, index) => {
        if (item.mode !== "FULL_MOVIE" && (!Number.isFinite(item.duration) || item.duration < MIN_PLAYLIST_DURATION_SECONDS)) {
          invalidItems.push(`${sig.name} No.${index + 1}: 表示時間は${MIN_PLAYLIST_DURATION_SECONDS}秒以上で入力してください。`);
        }
      });
    });
    if (invalidItems.length > 0) {
      await alert({ title: "保存できません", message: invalidItems.join("\n"), variant: "warning" });
      return;
    }
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      signages.forEach(sig => {
        batch.update(doc(db, "public_signages", sig.id), {
          playlist: editingPlaylists[sig.id] ?? [],
          allowInterrupt: editingInterrupts[sig.id] ?? true,
          theme: editingThemes[sig.id] ?? DEFAULT_SIGNAGE_THEME
        });
      });
      await batch.commit();
      const saved = buildSignageState(signages.map(sig => ({
        ...sig,
        playlist: editingPlaylists[sig.id] ?? [],
        allowInterrupt: editingInterrupts[sig.id] ?? true,
        theme: editingThemes[sig.id] ?? DEFAULT_SIGNAGE_THEME
      })));
      setOriginalPlaylists(clonePlaylists(saved.playlists));
      setOriginalInterrupts(saved.interrupts);
      setOriginalThemes(saved.themes);
      await alert({ title: "保存完了", message: "すべての設定を保存しました！", variant: "success" });
    } catch (e) { 
      console.error(e); 
      await alert({ title: "エラー", message: "保存に失敗しました。", variant: "danger" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    const trimmedLocation = newLocation.trim() || "未設定";
    if (!trimmedName) {
      await alert({ title: "入力エラー", message: "モニター名を入力してください。", variant: "warning" });
      return;
    }

    try {
      const newMonitor = {
        name: trimmedName,
        location: trimmedLocation,
        allowInterrupt: true,
        theme: DEFAULT_SIGNAGE_THEME,
        playlist: DEFAULT_PLAYLIST
      };
      const docRef = await addDoc(collection(db, "public_signages"), newMonitor);
      const playlistCopy = JSON.parse(JSON.stringify(DEFAULT_PLAYLIST)) as PlaylistItem[];
      setOriginalPlaylists(prev => ({ ...prev, [docRef.id]: playlistCopy }));
      setEditingPlaylists(prev => ({ ...prev, [docRef.id]: playlistCopy }));
      setOriginalInterrupts(prev => ({ ...prev, [docRef.id]: true }));
      setEditingInterrupts(prev => ({ ...prev, [docRef.id]: true }));
      setOriginalThemes(prev => ({ ...prev, [docRef.id]: DEFAULT_SIGNAGE_THEME }));
      setEditingThemes(prev => ({ ...prev, [docRef.id]: DEFAULT_SIGNAGE_THEME }));
      setNewName("");
      setShowAddForm(false);
    } catch (error) {
      console.error(error);
      await alert({ title: "追加失敗", message: "モニターを追加できませんでした。", variant: "danger" });
    }
  };

  const handleDelete = async (id: string) => {
    const isOk = await confirm({ title: "削除の確認", message: "削除しますか？", variant: "danger" });
    if (isOk) {
      await deleteDoc(doc(db, "public_signages", id));
    }
  };

  const handleManualMode = async (id: string, mode: string, videoAssetId: string | null = null, kind: "NORMAL" | "AD" = "NORMAL") => {
    await updateDoc(doc(db, "public_signages", id), {
      manualOverride: {
        mode,
        videoAssetId,
        kind,
        startedAt: serverTimestamp()
      },
      liveMode: null,
      manualPlaylist: null,
      manualPlaylistName: null,
      manualModeUpdatedAt: serverTimestamp()
    });
  };

  const handleInvokePlaylist = async (id: string, playlistId: string) => {
    const playlist = signagePlaylists.find(p => p.id === playlistId);
    if (!playlist || playlist.items.length === 0) return;
    await updateDoc(doc(db, "public_signages", id), {
      manualPlaylist: playlist.items,
      manualPlaylistName: playlist.name,
      manualOverride: null,
      liveMode: null,
      manualModeUpdatedAt: serverTimestamp()
    });
  };

  const handleReturnToAuto = async (id: string) => {
    await updateDoc(doc(db, "public_signages", id), {
      manualOverride: null,
      liveMode: null,
      manualPlaylist: null,
      manualPlaylistName: null,
      manualModeUpdatedAt: serverTimestamp()
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-[1700px] mx-auto w-full pb-32">
      <UnsavedBar
        hasChanges={hasChanges}
        onSave={handleSave}
        onReset={handleReset}
        isSaving={isSaving}
        message="一般モニターに保存していない変更があります。"
      />
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2"><Tv className="text-blue-500" /> 一般モニター管理</h2>
          <p className="text-slate-500 text-sm mt-1">自動プレイリスト、速報割り込み、手動モードでの表示送出を管理します。</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} className="w-full sm:w-auto"><Plus size={18} className="mr-2"/> 新規モニター追加</Button>
      </div>

      <Card className="mb-8 overflow-hidden">
        <button onClick={() => setIsExplanationOpen(!isExplanationOpen)} className="w-full flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Info size={18} /><h3 className="font-black uppercase tracking-widest text-sm">サイネージ画面モード解説</h3></div>
          <div className="text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full p-1">{isExplanationOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
        </button>
        {isExplanationOpen && (
          <CardContent className="pt-0 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-4 fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-6">
              {PRESETS.map(preset => (
                <div key={preset.id} className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                  <div className="w-full"><ScreenMockup mode={preset.id} /></div>
                  <div><p className="font-black text-slate-700 dark:text-slate-200 text-sm mb-1">{preset.name}</p><p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{preset.desc}</p></div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {showAddForm && (
        <Card className="mb-8 bg-blue-50/30 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50">
          <CardContent className="pt-6 flex flex-col md:flex-row gap-4 md:items-end">
            <Input label="設置場所" value={newLocation} onChange={e => setNewLocation(e.target.value)} />
            <Input label="モニター名" value={newName} onChange={e => setNewName(e.target.value)} />
            <Button className="shrink-0 h-[46px] w-full md:w-auto" onClick={handleAdd}>登録</Button>
          </CardContent>
        </Card>
      )}

      {signages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto mb-6 -mx-1 px-1 pb-1">
          {signages.map(sig => (
            <button
              key={sig.id}
              onClick={() => setActiveSignageId(sig.id)}
              className={`shrink-0 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black whitespace-nowrap transition ${
                activeSignageId === sig.id
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              }`}
            >
              <Tv size={14} />
              {sig.name}
              <Badge variant="info" className="text-[9px]">{sig.location}</Badge>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {signages.filter(sig => signages.length <= 1 || sig.id === activeSignageId).map(sig => {
          const playlist = editingPlaylists[sig.id] || [];
          const allowInterrupt = editingInterrupts[sig.id] ?? true;
          const manualOverride = sig.manualOverride || (sig.liveMode ? { mode: sig.liveMode, kind: "NORMAL" as const } : null);
          const selectedManualVideoId = selectedManualVideoIds[sig.id] || "";
          const selectedManualVideo = videoLibrary.find(video => video.id === selectedManualVideoId);
          return (
            <Card key={sig.id} className="overflow-hidden">
              <div className="flex flex-col xl:flex-row h-full">
                <div className="xl:w-80 bg-slate-50 dark:bg-slate-800/30 p-6 border-b xl:border-b-0 xl:border-r border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-4"><Badge variant="info" className="flex items-center gap-1"><MapPin size={10} />{sig.location}</Badge><Button variant="ghost" size="sm" className="text-slate-300 hover:text-red-500" onClick={() => handleDelete(sig.id)}><Trash2 size={18}/></Button></div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6">{sig.name}</h3>
                    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">現在の表示モード</p>
                      <Badge variant={manualOverride || sig.manualPlaylist ? "warning" : "success"} className="inline-flex items-center gap-1">
                        <MonitorPlay size={10} />
                        現在: {sig.manualPlaylist ? "手動プレイリスト" : manualOverride ? "手動モード" : "自動モード"}
                      </Badge>
                      {sig.manualPlaylist ? (
                        <p className="mt-2 truncate text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          再生中: {sig.manualPlaylistName || `${sig.manualPlaylist.length}件のプレイリスト`}
                        </p>
                      ) : manualOverride && (
                        <p className="mt-2 truncate text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          {manualOverride.kind === "AD" ? "広告動画" : "手動表示"} / {manualOverride.videoAssetId ? videoLibrary.find(video => video.id === manualOverride.videoAssetId)?.name || manualOverride.videoAssetId : PRESETS.find(preset => preset.id === manualOverride.mode)?.name || manualOverride.mode}
                        </p>
                      )}
                    </div>
                    <div className="mb-6">
                      <p className="text-[10px] font-black text-rose-500 uppercase mb-2 flex items-center gap-1"><BellRing size={12}/> 速報映像の割り込み許可</p>
                      <SegmentedControl
                        value={allowInterrupt ? "allow" : "deny"}
                        onChange={(value) => setEditingInterrupts(prev => ({ ...prev, [sig.id]: value === "allow" }))}
                        className="bg-white dark:bg-slate-900 rounded-lg p-1"
                        buttonClassName="py-1.5 text-xs"
                        items={[
                          {
                            value: "allow",
                            label: "許可 (ON)",
                            activeClassName: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 shadow-sm",
                          },
                          {
                            value: "deny",
                            label: "拒否",
                            icon: <BellOff size={12} />,
                            activeClassName: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm",
                          },
                        ]}
                      />
                    </div>
                    <div className="mb-6">
                      <p className="text-[10px] font-black text-indigo-500 uppercase mb-2 flex items-center gap-1"><MonitorPlay size={12}/> 表示テーマ</p>
                      <SegmentedControl<SignageTheme>
                        value={editingThemes[sig.id] ?? sig.theme ?? DEFAULT_SIGNAGE_THEME}
                        onChange={(value) => setEditingThemes(prev => ({ ...prev, [sig.id]: value }))}
                        className="bg-white dark:bg-slate-900 rounded-lg p-1"
                        buttonClassName="py-1.5 text-xs"
                        items={[
                          {
                            value: "light",
                            label: "ライト",
                            icon: <Sun size={12} />,
                            activeClassName: "bg-amber-50 text-amber-600 shadow-sm",
                          },
                          {
                            value: "dark",
                            label: "ダーク",
                            icon: <Moon size={12} />,
                            activeClassName: "bg-slate-900 text-blue-300 shadow-sm dark:bg-slate-800",
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="mt-auto">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Target URL</p>
                    <input readOnly value={`${window.location.protocol}//${window.location.host}/signage/public?id=${sig.id}`} className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-[10px] font-mono outline-none mb-2" />
                    <Button variant="outline" className="w-full text-xs py-2" onClick={() => window.open(`/signage/public?id=${sig.id}`, '_blank', 'width=1024,height=768')}><ExternalLink size={14} className="mr-2"/> 別窓で開く</Button>
                  </div>
                </div>
                <CardContent className="flex-1 p-6">
                  <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-300"><MonitorPlay size={14}/> 手動モード（旧OBSモード）</p>
                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">表示プリセットや広告動画を選んで送出すると、このモニターは自動ループを一時停止します。</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => handleReturnToAuto(sig.id)}>
                        <RotateCcw size={14} className="mr-2"/> 自動モードに戻す
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {PRESETS.filter(p => p.id !== "FULL_MOVIE" && p.id !== "FULL_IMAGE").map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => handleManualMode(sig.id, preset.id)}
                          className={`rounded-lg border p-2 text-left transition ${manualOverride?.mode === preset.id ? "border-indigo-500 bg-white shadow-md dark:bg-slate-900" : "border-slate-200 bg-white/70 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-950/60"}`}
                        >
                          <ScreenMockup mode={preset.id} />
                          <p className="mt-2 truncate text-[11px] font-black text-slate-700 dark:text-slate-200">{preset.name}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                    <div className="mb-3">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300"><PlaySquare size={14}/> 保存済みプレイリストの送出</p>
                      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">プレイリストライブラリで作成したCM等の組み合わせをこのモニターに送出し、先頭から1回だけ順番に再生します。</p>
                    </div>
                    {signagePlaylists.length === 0 ? (
                      <p className="text-[10px] font-bold text-slate-400">プレイリストライブラリで作成すると、ここで選択できます。</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <select
                          value={selectedPlaylistIds[sig.id] || ""}
                          onChange={e => setSelectedPlaylistIds(prev => ({ ...prev, [sig.id]: e.target.value }))}
                          className="w-full rounded-lg border border-emerald-100 bg-white p-2 text-xs font-bold text-slate-700 outline-none dark:border-emerald-900/40 dark:bg-slate-950 dark:text-slate-200"
                        >
                          <option value="">プレイリストを選択</option>
                          {signagePlaylists.map(p => <option key={p.id} value={p.id}>{p.name}（{p.items.length}件）</option>)}
                        </select>
                        <Button
                          size="sm"
                          className="h-10 shrink-0 text-xs"
                          disabled={!selectedPlaylistIds[sig.id]}
                          onClick={() => handleInvokePlaylist(sig.id, selectedPlaylistIds[sig.id])}
                        >
                          <Play size={14} className="mr-2" /> このモニターへ送出
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                    <div className="mb-3">
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-300"><Megaphone size={14}/> 広告動画の手動送出</p>
                      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">動画をプレビューで確認してから、このモニターへ手動モードとして送出します。</p>
                    </div>
                    {videoLibrary.length === 0 ? (
                      <p className="text-[10px] font-bold text-slate-400">動画ライブラリに動画を追加すると、ここで選択できます。</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setIsVideoPickerOpen(true)}
                            className="w-full truncate rounded-lg border border-blue-100 bg-white p-2 text-left text-xs font-bold text-slate-700 outline-none dark:border-blue-900/40 dark:bg-slate-950 dark:text-slate-200"
                          >
                            {selectedManualVideo?.name || "広告動画を選択"}
                          </button>
                          {selectedManualVideo?.videoAsset && (
                            <p className="mt-2 truncate text-[10px] font-black text-blue-500">
                              <Cloud size={12} className="mr-1 inline" />{getOptimizedStatusLabel(selectedManualVideo.videoAsset)} / {formatVideoBytes(getPreferredVideoAsset(selectedManualVideo.videoAsset)?.size)}
                            </p>
                          )}
                          <VideoPickerModal
                            isOpen={isVideoPickerOpen}
                            onClose={() => setIsVideoPickerOpen(false)}
                            videoLibrary={videoLibrary}
                            groups={videoGroups}
                            selectedVideoId={selectedManualVideoId}
                            onSelect={videoId => setSelectedManualVideoIds(prev => ({ ...prev, [sig.id]: videoId }))}
                            title="広告動画を選択"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedManualVideo?.videoAsset && (
                            <VideoAssetActions
                              asset={selectedManualVideo.videoAsset}
                              title={selectedManualVideo.name}
                              onPreview={(asset, title) => setPreview({ asset, title })}
                              className="flex shrink-0 items-center gap-1"
                            />
                          )}
                          <Button
                            size="sm"
                            className="h-10 shrink-0 text-xs"
                            disabled={!selectedManualVideoId}
                            onClick={() => handleManualMode(sig.id, "FULL_MOVIE", selectedManualVideoId, "AD")}
                          >
                            <Play size={14} className="mr-2" /> このモニターへ送出
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <PlaylistItemsEditor
                    items={playlist}
                    onChange={items => setEditingPlaylists(prev => ({ ...prev, [sig.id]: items }))}
                    videoLibrary={videoLibrary}
                    videoGroups={videoGroups}
                    imageLibrary={imageLibrary}
                    onPreview={(asset, title) => setPreview({ asset, title })}
                    onImagePreview={(asset, title) => setImagePreview({ asset, title })}
                    minDurationSeconds={MIN_PLAYLIST_DURATION_SECONDS}
                  />
                </CardContent>
              </div>
            </Card>
          );
        })}
      </div>
      <VideoPreviewModal asset={preview?.asset} title={preview?.title || ""} isOpen={!!preview} onClose={() => setPreview(null)} />
      <ImagePreviewModal asset={imagePreview?.asset} title={imagePreview?.title || ""} isOpen={!!imagePreview} onClose={() => setImagePreview(null)} />
    </div>
  );
}
