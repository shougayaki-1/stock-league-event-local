import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, deleteField, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { AlertTriangle, CheckCircle, Film, Pencil, Play, RefreshCw, Trash2, Upload, Volume2, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { createCloudVideoVersion, createVideoAssetId, formatVideoBytes, getOptimizedStatusLabel, getPreferredVideoAsset, safeStorageFileName, uploadCloudVideo, type CloudVideoAsset } from "../../lib/cloudVideos";
import { VIDEO_LIBRARY_COLLECTION, type VideoLibraryItem } from "../../types/videoLibrary";
import { VIDEO_GROUPS_COLLECTION, type VideoGroup } from "../../types/videoGroup";
import { groupVideoLibraryItems, nextGroupOrder, sortGroupsByOrder } from "../../lib/videoGroups";
import VideoGroupManager from "../../components/admin/video/VideoGroupManager";
import { findVideoReferences, type VideoLibraryUsageSnapshot } from "../../lib/videoLibraryGuards";
import { MAX_MEDIA_ELEMENT_GAIN, clampMediaElementGain } from "../../hooks/useMediaElementGain";
import type { ScenarioEvent } from "../../types/scenario";
import type { NewsPreset } from "../../types/newsPreset";
import type { RiddleRoom } from "../../lib/riddleConstants";
import IconButton from "../../components/ui/IconButton";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { useDialog } from "../../contexts/DialogContext";
import VideoPreviewModal, { VideoAssetActions } from "../../components/admin/video/VideoPreviewModal";
import { beginCriticalOperation } from "../../lib/criticalOperation";

interface PublicSignageForGuard {
  id: string;
  name: string;
  playlist?: Array<{ videoAssetId?: string | null }>;
  manualOverride?: { videoAssetId?: string | null } | null;
}

interface UploadJob {
  id: string;
  file: File;
  name: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

const MAX_VOLUME_PERCENT = MAX_MEDIA_ELEMENT_GAIN * 100;
const toVolumePercent = (volumeGain?: number) => Math.round(clampMediaElementGain(volumeGain ?? 1) * 100);

export default function VideoLibrary() {
  const [items, setItems] = useState<VideoLibraryItem[]>([]);
  const [groups, setGroups] = useState<VideoGroup[]>([]);
  const [usage, setUsage] = useState<VideoLibraryUsageSnapshot>({ events: [], newsPresets: [], riddleRooms: [], publicSignages: [] });
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<{ asset: CloudVideoAsset; title: string; volumeGain?: number } | null>(null);
  const { alert, confirm, prompt } = useDialog();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, VIDEO_LIBRARY_COLLECTION), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoLibraryItem)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, VIDEO_GROUPS_COLLECTION), (snap) => {
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoGroup)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "events"), (snap) => {
        setUsage(prev => ({ ...prev, events: snap.docs.map(d => {
          const data = d.data() as ScenarioEvent;
          return { id: d.id, breakingVideoId: data.breakingVideoId, signageAction: data.signageAction };
        }) }));
      }),
      onSnapshot(collection(db, "news_presets"), (snap) => {
        setUsage(prev => ({
          ...prev,
          newsPresets: snap.docs.map(d => {
            const data = d.data() as NewsPreset;
            return { id: d.id, name: data.name || d.id, breakingVideoId: data.breakingVideoId, signageDisplay: data.signageDisplay };
          }),
        }));
      }),
      onSnapshot(collection(db, "riddle_rooms"), (snap) => {
        setUsage(prev => ({
          ...prev,
          riddleRooms: snap.docs.map(d => {
            const data = d.data() as RiddleRoom;
            return { id: d.id, name: data.name || d.id, steps: data.steps || [] };
          }),
        }));
      }),
      onSnapshot(collection(db, "public_signages"), (snap) => {
        setUsage(prev => ({
          ...prev,
          publicSignages: snap.docs.map(d => {
            const data = d.data() as PublicSignageForGuard;
            return { id: d.id, name: data.name || d.id, playlist: data.playlist || [], manualOverride: data.manualOverride || null };
          }),
        }));
      }),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const usageByVideoId = useMemo(() => {
    return Object.fromEntries(items.map(item => [item.id, findVideoReferences(item.id, usage)]));
  }, [items, usage]);

  const videoCountByGroupId = useMemo(() => {
    return Object.fromEntries(groups.map(group => [group.id, items.filter(item => item.groupId === group.id).length]));
  }, [groups, items]);

  const groupedSections = useMemo(() => groupVideoLibraryItems(items, groups), [items, groups]);

  const activeReplaceProgress = useMemo(() => {
    const activeId = replacingId || Object.keys(replaceProgress)[0];
    if (!activeId) return null;
    const item = items.find(video => video.id === activeId);
    return {
      id: activeId,
      name: item?.name || activeId,
      progress: replaceProgress[activeId] ?? 0,
    };
  }, [items, replaceProgress, replacingId]);

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const jobs = Array.from(files).map(file => ({
      id: createVideoAssetId(),
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      progress: 0,
      status: "pending" as const,
    }));
    setUploadJobs(prev => [...prev, ...jobs]);
  };

  const updateJob = (id: string, patch: Partial<UploadJob>) => {
    setUploadJobs(prev => prev.map(job => job.id === id ? { ...job, ...patch } : job));
  };

  const uploadJob = async (job: UploadJob) => {
    const trimmedName = job.name.trim() || job.file.name.replace(/\.[^.]+$/, "");
    const videoRef = doc(collection(db, VIDEO_LIBRARY_COLLECTION));
    const version = createCloudVideoVersion();
    const storagePath = `signage/video-library/${videoRef.id}-${version}-${safeStorageFileName(job.file.name)}`;
    try {
      updateJob(job.id, { status: "uploading", progress: 0, error: undefined });
      const asset = await uploadCloudVideo(job.file, storagePath, version, progress => updateJob(job.id, { progress }));
      await setDoc(videoRef, {
        name: trimmedName,
        videoAsset: asset,
        volumeGain: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      updateJob(job.id, { status: "success", progress: 100 });
    } catch (error) {
      console.error(error);
      updateJob(job.id, { status: "error", error: error instanceof Error ? error.message : "動画を追加できませんでした。" });
    }
  };

  const handleUploadPendingJobs = async () => {
    const pending = uploadJobs.filter(job => job.status === "pending" || job.status === "error");
    if (pending.length === 0) return;
    await Promise.all(pending.map(uploadJob));
    const failed = uploadJobs.filter(job => job.status === "error").length;
    if (failed === 0) {
      await alert({ title: "アップロード完了", message: "選択した動画を追加しました。", variant: "success" });
    }
  };

  const handleReplace = async (item: VideoLibraryItem, file: File | undefined) => {
    if (!file) return;
    const isOk = await confirm({
      title: "動画ファイルを差し替え",
      message: `「${item.name}」の参照先は維持したまま、動画ファイルだけを差し替えます。よろしいですか？`,
      confirmText: "差し替える",
    });
    if (!isOk) return;

    const version = createCloudVideoVersion();
    const storagePath = `signage/video-library/${item.id}-${version}-${safeStorageFileName(file.name)}`;
    const endCriticalOperation = beginCriticalOperation();
    try {
      setReplacingId(item.id);
      setReplaceProgress(prev => ({ ...prev, [item.id]: 0 }));
      const asset = await uploadCloudVideo(file, storagePath, version, progress => {
        setReplaceProgress(prev => ({ ...prev, [item.id]: progress }));
      });
      await setDoc(doc(db, VIDEO_LIBRARY_COLLECTION, item.id), { videoAsset: asset, updatedAt: asset.updatedAt }, { merge: true });
      setReplaceProgress(prev => ({ ...prev, [item.id]: 100 }));
      await alert({ title: "差し替え完了", message: `「${item.name}」の動画ファイルを更新しました。`, variant: "success" });
    } catch (error) {
      console.error(error);
      await alert({ title: "差し替え失敗", message: error instanceof Error ? error.message : "動画を差し替えられませんでした。", variant: "danger" });
    } finally {
      endCriticalOperation();
      setReplacingId(null);
      window.setTimeout(() => {
        setReplaceProgress(prev => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }, 1200);
    }
  };

  const handleRename = async (item: VideoLibraryItem) => {
    const nextName = await prompt({
      title: "動画名を変更",
      message: "動画ライブラリ上の表示名を変更します。参照中の設定はそのまま維持されます。",
      defaultValue: item.name,
      placeholder: "動画名",
      confirmText: "変更を保存",
    });
    if (nextName === null) return;

    const trimmedName = nextName.trim();
    if (!trimmedName) {
      await alert({ title: "動画名が空です", message: "1文字以上の動画名を入力してください。", variant: "warning" });
      return;
    }
    if (trimmedName === item.name) return;

    try {
      await setDoc(doc(db, VIDEO_LIBRARY_COLLECTION, item.id), { name: trimmedName, updatedAt: Date.now() }, { merge: true });
      await alert({ title: "動画名を変更しました", message: `「${item.name}」を「${trimmedName}」に変更しました。`, variant: "success" });
    } catch (error) {
      console.error(error);
      await alert({ title: "名前変更に失敗", message: error instanceof Error ? error.message : "動画名を変更できませんでした。", variant: "danger" });
    }
  };

  const handleVolumeGainChange = async (item: VideoLibraryItem, nextPercent: number) => {
    const volumeGain = clampMediaElementGain(nextPercent / 100);
    setItems(prev => prev.map(video => video.id === item.id ? { ...video, volumeGain, updatedAt: Date.now() } : video));
    try {
      await setDoc(doc(db, VIDEO_LIBRARY_COLLECTION, item.id), { volumeGain, updatedAt: Date.now() }, { merge: true });
    } catch (error) {
      console.error(error);
      await alert({ title: "音量設定に失敗", message: error instanceof Error ? error.message : "動画の音量ゲインを保存できませんでした。", variant: "danger" });
    }
  };

  const handleDelete = async (item: VideoLibraryItem) => {
    const refs = usageByVideoId[item.id] || [];
    if (refs.length > 0) {
      await alert({
        title: "削除できません",
        message: `この動画は使用中です。\n\n${refs.map(ref => `・${ref.label}`).join("\n")}`,
        variant: "warning",
      });
      return;
    }
    const isOk = await confirm({
      title: "動画を削除",
      message: `「${item.name}」を動画ライブラリから削除します。Storage上の古いファイルは手動クリーンアップ対象です。`,
      confirmText: "削除する",
      variant: "danger",
    });
    if (!isOk) return;
    await deleteDoc(doc(db, VIDEO_LIBRARY_COLLECTION, item.id));
  };

  const handleCreateGroup = async () => {
    const name = await prompt({
      title: "新しいグループ",
      message: "動画ライブラリのグループ名を入力してください。",
      placeholder: "グループ名",
      confirmText: "作成",
    });
    if (name === null) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      await alert({ title: "グループ名が空です", message: "1文字以上のグループ名を入力してください。", variant: "warning" });
      return;
    }
    const groupRef = doc(collection(db, VIDEO_GROUPS_COLLECTION));
    await setDoc(groupRef, {
      name: trimmedName,
      order: nextGroupOrder(groups),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  };

  const handleRenameGroup = async (group: VideoGroup) => {
    const nextName = await prompt({
      title: "グループ名を変更",
      message: "動画ライブラリ上のグループ表示名を変更します。",
      defaultValue: group.name,
      placeholder: "グループ名",
      confirmText: "変更を保存",
    });
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === group.name) return;
    await setDoc(doc(db, VIDEO_GROUPS_COLLECTION, group.id), { name: trimmedName, updatedAt: Date.now() }, { merge: true });
  };

  const handleDeleteGroup = async (group: VideoGroup) => {
    const affected = items.filter(item => item.groupId === group.id);
    const isOk = await confirm({
      title: "グループを削除",
      message: affected.length > 0
        ? `「${group.name}」を削除します。所属する${affected.length}件の動画は未分類に戻ります。よろしいですか？`
        : `「${group.name}」を削除します。よろしいですか？`,
      confirmText: "削除する",
      variant: "danger",
    });
    if (!isOk) return;

    const batch = writeBatch(db);
    affected.forEach(item => {
      batch.update(doc(db, VIDEO_LIBRARY_COLLECTION, item.id), { groupId: deleteField(), updatedAt: Date.now() });
    });
    batch.delete(doc(db, VIDEO_GROUPS_COLLECTION, group.id));
    await batch.commit();
  };

  const handleChangeVideoGroup = async (item: VideoLibraryItem, groupId: string) => {
    await setDoc(
      doc(db, VIDEO_LIBRARY_COLLECTION, item.id),
      { groupId: groupId ? groupId : deleteField(), updatedAt: Date.now() },
      { merge: true }
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      {activeReplaceProgress && (
        <div className="fixed right-4 bottom-4 z-[70] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-outline-variant bg-surface p-4 text-on-surface shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black text-primary">差し替えアップロード中</p>
              <p className="truncate text-sm font-black">{activeReplaceProgress.name}</p>
            </div>
            <span className="shrink-0 text-sm font-black text-on-surface-variant">{activeReplaceProgress.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-variant">
            <div className="h-full bg-primary transition-all" style={{ width: `${activeReplaceProgress.progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
            <Film className="text-primary" /> 動画ライブラリ
          </h1>
          <p className="mt-1 text-sm font-bold text-on-surface-variant">
            サイネージ、速報、広告、謎解きで共通利用する動画を管理します。
          </p>
        </div>
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-90">
          <Upload size={16} />
          動画を選択
          <input type="file" accept="video/*" multiple className="sr-only" onChange={e => handleFilesSelected(e.target.files)} />
        </label>
      </div>

      {uploadJobs.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">アップロード待ち / 進捗</CardTitle>
            <div className="flex items-center gap-2">
              <IconButton aria-label="完了したアップロードを消去" size="sm" variant="outline" onClick={() => setUploadJobs(prev => prev.filter(job => job.status !== "success"))}>
                <X size={16} />
              </IconButton>
              <button
                type="button"
                onClick={handleUploadPendingJobs}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-on-primary"
              >
                <Play size={14} />
                選択動画をアップロード
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {uploadJobs.map(job => (
              <div key={job.id} className="grid grid-cols-1 gap-3 rounded-xl border border-outline-variant p-3 md:grid-cols-[minmax(0,1fr)_160px_90px_auto] md:items-center">
                <div className="min-w-0">
                  <input
                    value={job.name}
                    onChange={e => updateJob(job.id, { name: e.target.value })}
                    disabled={job.status === "uploading" || job.status === "success"}
                    className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold text-on-surface"
                  />
                  <p className="mt-1 truncate text-[10px] font-bold text-on-surface-variant">{job.file.name} / {formatVideoBytes(job.file.size)}</p>
                  {job.error && <p className="mt-1 text-[10px] font-black text-error">{job.error}</p>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-variant">
                  <div className="h-full bg-primary transition-all" style={{ width: `${job.progress}%` }} />
                </div>
                <p className="text-xs font-black text-on-surface-variant">{job.progress}%</p>
                <div className="flex items-center justify-end gap-2 text-xs font-black">
                  {job.status === "success" && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle size={14} />完了</span>}
                  {job.status === "error" && <span className="inline-flex items-center gap-1 text-error"><AlertTriangle size={14} />失敗</span>}
                  {job.status === "uploading" && <span className="text-primary">アップロード中</span>}
                  {job.status === "pending" && <span className="text-on-surface-variant">待機中</span>}
                  <IconButton aria-label="アップロードジョブを削除" size="sm" variant="ghost" onClick={() => setUploadJobs(prev => prev.filter(item => item.id !== job.id))} disabled={job.status === "uploading"}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <VideoGroupManager
        groups={groups}
        videoCountByGroupId={videoCountByGroupId}
        onCreate={handleCreateGroup}
        onRename={handleRenameGroup}
        onDelete={handleDeleteGroup}
      />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 px-4 py-3 md:px-5">
          <CardTitle className="text-base">登録動画</CardTitle>
          <span className="text-xs font-black text-on-surface-variant">{items.length} 件</span>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-6 text-sm font-bold text-on-surface-variant">
              動画がまだ登録されていません。
            </div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {groupedSections.map(section => (
                <div key={section.groupId ?? "ungrouped"}>
                  <div className="bg-surface-container px-4 py-2 text-xs font-black text-on-surface-variant md:px-5">
                    {section.name}（{section.videos.length}件）
                  </div>
                  <div className="divide-y divide-outline-variant">
                    {section.videos.map(item => {
                      const preferred = getPreferredVideoAsset(item.videoAsset);
                      const refs = usageByVideoId[item.id] || [];
                      const currentReplaceProgress = replaceProgress[item.id];
                      const isReplacing = replacingId === item.id || currentReplaceProgress !== undefined;
                      return (
                        <div key={item.id} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[120px_minmax(0,1.2fr)_140px_180px_minmax(180px,0.8fr)_minmax(0,1fr)_auto] md:items-center md:px-5">
                          <button
                            type="button"
                            onClick={() => preferred?.downloadUrl && setPreview({ asset: item.videoAsset, title: item.name, volumeGain: item.volumeGain })}
                            disabled={!preferred?.downloadUrl}
                            className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-950 text-left disabled:cursor-not-allowed disabled:opacity-60 md:w-[120px]"
                          >
                            {preferred?.downloadUrl ? (
                              <>
                                <video src={preferred.downloadUrl} muted preload="metadata" className="h-full w-full object-cover opacity-80" />
                                <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                                  <Play size={24} fill="currentColor" />
                                </span>
                              </>
                            ) : (
                              <span className="flex h-full items-center justify-center text-[10px] font-black text-slate-400">No preview</span>
                            )}
                          </button>

                          <div className="min-w-0">
                            <h2 className="truncate text-sm font-black text-on-surface">{item.name}</h2>
                            <p className="mt-1 truncate text-[11px] font-bold text-on-surface-variant">{item.id}</p>
                            {isReplacing && (
                              <div className="mt-2 max-w-sm">
                                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black text-primary">
                                  <span>差し替えアップロード中</span>
                                  <span>{currentReplaceProgress ?? 0}%</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-surface-variant">
                                  <div className="h-full bg-primary transition-all" style={{ width: `${currentReplaceProgress ?? 0}%` }} />
                                </div>
                              </div>
                            )}
                          </div>

                          <select
                            value={item.groupId || ""}
                            onChange={e => handleChangeVideoGroup(item, e.target.value)}
                            aria-label={`${item.name}のグループ`}
                            className="w-full rounded-lg border border-outline-variant bg-surface px-2 py-2 text-xs font-bold text-on-surface outline-none"
                          >
                            <option value="">未分類</option>
                            {sortGroupsByOrder(groups).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                          </select>

                          <div className="grid grid-cols-2 gap-2 text-xs font-bold text-on-surface-variant md:block md:space-y-1">
                            <p className="truncate">
                              <span className="mr-1 text-[10px] font-black uppercase tracking-widest">Status</span>
                              <span className="text-on-surface">{getOptimizedStatusLabel(item.videoAsset)}</span>
                            </p>
                            <p className="truncate">
                              <span className="mr-1 text-[10px] font-black uppercase tracking-widest">Size</span>
                              <span className="text-on-surface">{formatVideoBytes(preferred?.size)}</span>
                            </p>
                          </div>

                          <div className="min-w-0 rounded-lg border border-outline-variant bg-surface px-3 py-2">
                            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                              <span className="inline-flex items-center gap-1">
                                <Volume2 size={12} />
                                Gain
                              </span>
                              <span className="text-on-surface">{toVolumePercent(item.volumeGain)}%</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={MAX_VOLUME_PERCENT}
                              step={1}
                              value={toVolumePercent(item.volumeGain)}
                              onChange={e => void handleVolumeGainChange(item, Number(e.target.value))}
                              aria-label={`${item.name}の音量ゲイン`}
                              className="w-full accent-primary"
                            />
                          </div>

                          <div className="min-w-0 text-xs font-bold">
                            {refs.length === 0 ? (
                              <p className="text-on-surface-variant">未使用</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {refs.map((ref, index) => (
                                  <span key={`${ref.kind}-${index}`} className="max-w-full truncate rounded-full bg-surface-variant px-2 py-1 text-on-surface">
                                    {ref.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-1">
                            <VideoAssetActions asset={item.videoAsset} title={item.name} volumeGain={item.volumeGain} onPreview={(asset, title, volumeGain) => setPreview({ asset, title, volumeGain })} />
                            <IconButton aria-label={`${item.name}の名前を変更`} size="sm" variant="outline" onClick={() => handleRename(item)}>
                              <Pencil size={15} />
                            </IconButton>
                            <label className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant hover:bg-on-surface/8 ${isReplacing ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                              <RefreshCw size={15} />
                              <input
                                type="file"
                                accept="video/*"
                                className="sr-only"
                                onChange={e => {
                                  const file = e.currentTarget.files?.[0];
                                  // 同じファイルを続けて差し替える場合にも change イベントを発火させる。
                                  e.currentTarget.value = "";
                                  void handleReplace(item, file);
                                }}
                                disabled={isReplacing}
                              />
                            </label>
                            <IconButton aria-label={`${item.name}を削除`} size="sm" variant="outline" onClick={() => handleDelete(item)} className="text-error">
                              <Trash2 size={16} />
                            </IconButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <VideoPreviewModal asset={preview?.asset} title={preview?.title || ""} volumeGain={preview?.volumeGain} isOpen={!!preview} onClose={() => setPreview(null)} />
    </div>
  );
}
