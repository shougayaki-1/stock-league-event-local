import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { AlertTriangle, CheckCircle, Image as ImageIcon, Pencil, Play, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { createImageAssetId, formatImageBytes, safeImageStorageFileName, uploadCloudImage, type CloudImageAsset } from "../../lib/cloudImages";
import { IMAGE_LIBRARY_COLLECTION, type ImageLibraryItem } from "../../types/imageLibrary";
import { findImageReferences, type ImageLibraryUsageSnapshot } from "../../lib/imageLibraryGuards";
import { FIRESTORE_COLLECTIONS } from "../../lib/firestorePaths";
import { useDialog } from "../../contexts/DialogContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import IconButton from "../../components/ui/IconButton";
import ImagePreviewModal, { ImageAssetActions } from "../../components/admin/image/ImagePreviewModal";

interface UploadJob {
  id: string;
  file: File;
  name: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

export default function ImageLibrary() {
  const [items, setItems] = useState<ImageLibraryItem[]>([]);
  const [usage, setUsage] = useState<ImageLibraryUsageSnapshot>({ signagePlaylists: [], publicSignages: [] });
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<{ asset: CloudImageAsset; title: string } | null>(null);
  const { alert, confirm, prompt } = useDialog();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, IMAGE_LIBRARY_COLLECTION), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as ImageLibraryItem)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, FIRESTORE_COLLECTIONS.signagePlaylists), (snap) => {
        setUsage(prev => ({ ...prev, signagePlaylists: snap.docs.map(d => ({ id: d.id, name: String(d.data().name || d.id), items: d.data().items || [] })) }));
      }),
      onSnapshot(collection(db, FIRESTORE_COLLECTIONS.publicSignages), (snap) => {
        setUsage(prev => ({
          ...prev,
          publicSignages: snap.docs.map(d => {
            const data = d.data();
            return { id: d.id, name: String(data.name || d.id), playlist: data.playlist || [], manualOverride: data.manualOverride || null };
          }),
        }));
      }),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, []);

  const usageByImageId = useMemo(() => {
    return Object.fromEntries(items.map(item => [item.id, findImageReferences(item.id, usage)]));
  }, [items, usage]);

  const updateJob = (id: string, patch: Partial<UploadJob>) => {
    setUploadJobs(prev => prev.map(job => job.id === id ? { ...job, ...patch } : job));
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const jobs = Array.from(files).map(file => ({
      id: createImageAssetId(),
      file,
      name: file.name.replace(/\.[^.]+$/, ""),
      progress: 0,
      status: "pending" as const,
    }));
    setUploadJobs(prev => [...prev, ...jobs]);
  };

  const uploadJob = async (job: UploadJob) => {
    const trimmedName = job.name.trim() || job.file.name.replace(/\.[^.]+$/, "");
    const imageRef = doc(collection(db, IMAGE_LIBRARY_COLLECTION));
    const storagePath = `signage/image-library/${imageRef.id}-${safeImageStorageFileName(job.file.name)}`;
    try {
      updateJob(job.id, { status: "uploading", progress: 0, error: undefined });
      const asset = await uploadCloudImage(job.file, storagePath, job.file.name, progress => updateJob(job.id, { progress }));
      await setDoc(imageRef, {
        name: trimmedName,
        imageAsset: asset,
        source: "upload",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      updateJob(job.id, { status: "success", progress: 100 });
    } catch (error) {
      console.error(error);
      updateJob(job.id, { status: "error", error: error instanceof Error ? error.message : "画像を追加できませんでした。" });
    }
  };

  const handleUploadPendingJobs = async () => {
    const pending = uploadJobs.filter(job => job.status === "pending" || job.status === "error");
    if (pending.length === 0) return;
    await Promise.all(pending.map(uploadJob));
    await alert({ title: "アップロード完了", message: "選択した画像の処理が完了しました。", variant: "success" });
  };

  const handleReplace = async (item: ImageLibraryItem, file: File | undefined) => {
    if (!file) return;
    const isOk = await confirm({
      title: "画像ファイルを差し替え",
      message: `「${item.name}」の参照先は維持したまま、画像ファイルだけを差し替えます。よろしいですか？`,
      confirmText: "差し替える",
    });
    if (!isOk) return;
    const storagePath = `signage/image-library/${item.id}-${Date.now()}-${safeImageStorageFileName(file.name)}`;
    try {
      setReplacingId(item.id);
      setReplaceProgress(prev => ({ ...prev, [item.id]: 0 }));
      const asset = await uploadCloudImage(file, storagePath, file.name, progress => setReplaceProgress(prev => ({ ...prev, [item.id]: progress })));
      await setDoc(doc(db, IMAGE_LIBRARY_COLLECTION, item.id), { imageAsset: asset, updatedAt: asset.updatedAt }, { merge: true });
      await alert({ title: "差し替え完了", message: `「${item.name}」の画像ファイルを更新しました。`, variant: "success" });
    } catch (error) {
      console.error(error);
      await alert({ title: "差し替え失敗", message: error instanceof Error ? error.message : "画像を差し替えられませんでした。", variant: "danger" });
    } finally {
      setReplacingId(null);
      window.setTimeout(() => setReplaceProgress(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }), 1200);
    }
  };

  const handleRename = async (item: ImageLibraryItem) => {
    const nextName = await prompt({
      title: "画像名を変更",
      message: "画像ライブラリ上の表示名を変更します。参照中の設定はそのまま維持されます。",
      defaultValue: item.name,
      placeholder: "画像名",
      confirmText: "変更を保存",
    });
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === item.name) return;
    await setDoc(doc(db, IMAGE_LIBRARY_COLLECTION, item.id), { name: trimmedName, updatedAt: Date.now() }, { merge: true });
  };

  const handleDelete = async (item: ImageLibraryItem) => {
    const refs = usageByImageId[item.id] || [];
    if (refs.length > 0) {
      await alert({
        title: "削除できません",
        message: `この画像は使用中です。\n\n${refs.map(ref => `・${ref.label}`).join("\n")}`,
        variant: "warning",
      });
      return;
    }
    const isOk = await confirm({
      title: "画像を削除",
      message: `「${item.name}」を画像ライブラリから削除します。Storage上の古いファイルは手動クリーンアップ対象です。`,
      confirmText: "削除する",
      variant: "danger",
    });
    if (!isOk) return;
    await deleteDoc(doc(db, IMAGE_LIBRARY_COLLECTION, item.id));
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
            <ImageIcon className="text-primary" /> 画像ライブラリ
          </h1>
          <p className="mt-1 text-sm font-bold text-on-surface-variant">
            サイネージで表示する画像を管理します。アップロード画像とテンプレート生成画像をまとめて扱えます。
          </p>
        </div>
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-90">
          <Upload size={16} />
          画像を選択
          <input type="file" accept="image/*" multiple className="sr-only" onChange={e => handleFilesSelected(e.target.files)} />
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
              <button type="button" onClick={handleUploadPendingJobs} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-on-primary">
                <Play size={14} /> 選択画像をアップロード
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {uploadJobs.map(job => (
              <div key={job.id} className="grid grid-cols-1 gap-3 rounded-xl border border-outline-variant p-3 md:grid-cols-[minmax(0,1fr)_160px_90px_auto] md:items-center">
                <div className="min-w-0">
                  <input value={job.name} onChange={e => updateJob(job.id, { name: e.target.value })} disabled={job.status === "uploading" || job.status === "success"} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-bold text-on-surface" />
                  <p className="mt-1 truncate text-[10px] font-bold text-on-surface-variant">{job.file.name} / {formatImageBytes(job.file.size)}</p>
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

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 px-4 py-3 md:px-5">
          <CardTitle className="text-base">登録画像</CardTitle>
          <span className="text-xs font-black text-on-surface-variant">{items.length} 件</span>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-6 text-sm font-bold text-on-surface-variant">画像がまだ登録されていません。</div>
          ) : (
            <div className="divide-y divide-outline-variant">
              {items.map(item => {
                const refs = usageByImageId[item.id] || [];
                const currentReplaceProgress = replaceProgress[item.id];
                const isReplacing = replacingId === item.id || currentReplaceProgress !== undefined;
                return (
                  <div key={item.id} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[140px_minmax(0,1.2fr)_180px_minmax(0,1fr)_auto] md:items-center md:px-5">
                    <button type="button" onClick={() => setPreview({ asset: item.imageAsset, title: item.name })} className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-950 text-left md:w-[140px]">
                      <img src={item.imageAsset.downloadUrl} alt="" className="h-full w-full object-cover opacity-90" />
                    </button>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-black text-on-surface">{item.name}</h2>
                      <p className="mt-1 truncate text-[11px] font-bold text-on-surface-variant">{item.source === "template" ? `テンプレート: ${item.templateId}` : item.id}</p>
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
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold text-on-surface-variant md:block md:space-y-1">
                      <p className="truncate"><span className="mr-1 text-[10px] font-black uppercase tracking-widest">Size</span><span className="text-on-surface">{formatImageBytes(item.imageAsset.size)}</span></p>
                      <p className="truncate"><span className="mr-1 text-[10px] font-black uppercase tracking-widest">Pixels</span><span className="text-on-surface">{item.imageAsset.width} x {item.imageAsset.height}</span></p>
                    </div>
                    <div className="min-w-0 text-xs font-bold">
                      {refs.length === 0 ? (
                        <p className="text-on-surface-variant">未使用</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {refs.map((ref, index) => (
                            <span key={`${ref.kind}-${index}`} className="max-w-full truncate rounded-full bg-surface-variant px-2 py-1 text-on-surface">{ref.label}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <ImageAssetActions asset={item.imageAsset} title={item.name} onPreview={(asset, title) => setPreview({ asset, title })} />
                      <IconButton aria-label={`${item.name}の名前を変更`} size="sm" variant="outline" onClick={() => handleRename(item)}>
                        <Pencil size={15} />
                      </IconButton>
                      <label className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant hover:bg-on-surface/8 ${isReplacing ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                        <RefreshCw size={15} />
                        <input type="file" accept="image/*" className="sr-only" onChange={e => handleReplace(item, e.target.files?.[0])} disabled={isReplacing} />
                      </label>
                      <IconButton aria-label={`${item.name}を削除`} size="sm" variant="outline" onClick={() => handleDelete(item)} className="text-error">
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <ImagePreviewModal asset={preview?.asset} title={preview?.title || ""} isOpen={!!preview} onClose={() => setPreview(null)} />
    </div>
  );
}
