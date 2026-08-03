import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Cloud, Film, Newspaper, Pencil, Plus, Search, Trash2, Tv, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import IconButton from "../../components/ui/IconButton";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import Textarea from "../../components/ui/Textarea";
import { useDialog } from "../../contexts/DialogContext";
import NewsPresetCsvImporter from "../../components/admin/newsPreset/NewsPresetCsvImporter";
import {
  deleteNewsPreset,
  deleteNewsPresets,
  hasDuplicateNewsPresetName,
  saveNewsPreset,
  subscribeNewsPresets,
} from "../../services/newsPresetService";
import type { NewsPreset } from "../../types/newsPreset";
import { subscribeScenarioVideoLibrary } from "../../services/scenarioService";
import type { VideoLibraryItem } from "../../types/videoLibrary";
import { PUBLIC_SIGNAGE_PRESETS } from "../../lib/signagePresets";
import { formatVideoBytes, getOptimizedStatusLabel, getPreferredVideoAsset, type CloudVideoAsset } from "../../lib/cloudVideos";
import VideoPreviewModal, { VideoAssetActions } from "../../components/admin/video/VideoPreviewModal";

interface FormState {
  id: string | null;
  name: string;
  title: string;
  body: string;
  breakingVideoId: string;
  signageEnabled: boolean;
  signageMode: string;
  signageDuration: number;
  signageVideoAssetId: string;
  signageKind: "NORMAL" | "AD";
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  title: "",
  body: "",
  breakingVideoId: "",
  signageEnabled: false,
  signageMode: "STOCK_GRID",
  signageDuration: 30,
  signageVideoAssetId: "",
  signageKind: "NORMAL",
};

export default function NewsPresetLibrary() {
  const [presets, setPresets] = useState<NewsPreset[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [preview, setPreview] = useState<{ asset: CloudVideoAsset; title: string } | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(() => new Set());
  const { alert, confirm } = useDialog();

  useEffect(() => subscribeNewsPresets(setPresets), []);
  useEffect(() => subscribeScenarioVideoLibrary(setVideoLibrary), []);

  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter(preset =>
      preset.name.toLowerCase().includes(q) ||
      preset.title.toLowerCase().includes(q) ||
      preset.body.toLowerCase().includes(q)
    );
  }, [presets, query]);

  const selectedPresets = useMemo(
    () => presets.filter(preset => selectedPresetIds.has(preset.id)),
    [presets, selectedPresetIds]
  );

  const selectedVisibleCount = useMemo(
    () => filteredPresets.filter(preset => selectedPresetIds.has(preset.id)).length,
    [filteredPresets, selectedPresetIds]
  );

  const isAllVisibleSelected = filteredPresets.length > 0 && selectedVisibleCount === filteredPresets.length;

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const toggleSelectPreset = (presetId: string) => {
    setSelectedPresetIds(prev => {
      const next = new Set(prev);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedPresetIds(prev => {
      const next = new Set(prev);
      if (isAllVisibleSelected) {
        filteredPresets.forEach(preset => next.delete(preset.id));
      } else {
        filteredPresets.forEach(preset => next.add(preset.id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedPresetIds(new Set());
  };

  const startEdit = (preset: NewsPreset) => {
    setForm({
      id: preset.id,
      name: preset.name,
      title: preset.title,
      body: preset.body,
      breakingVideoId: preset.breakingVideoId || "",
      signageEnabled: Boolean(preset.signageDisplay),
      signageMode: preset.signageDisplay?.mode || "STOCK_GRID",
      signageDuration: preset.signageDisplay?.duration || 30,
      signageVideoAssetId: preset.signageDisplay?.videoAssetId || "",
      signageKind: preset.signageDisplay?.kind || "NORMAL",
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    const input = {
      name: form.name.trim(),
      title: form.title.trim(),
      body: form.body.trim(),
      breakingVideoId: form.breakingVideoId || null,
      signageDisplay: form.signageEnabled ? {
        mode: form.signageMode,
        duration: Math.max(5, Number(form.signageDuration) || 30),
        videoAssetId: form.signageVideoAssetId || null,
        kind: form.signageKind,
      } : null,
    };
    if (!input.name || !input.title || !input.body) {
      await alert({ title: "入力エラー", message: "プリセット名・見出し・本文をすべて入力してください。", variant: "warning" });
      return;
    }
    if (input.signageDisplay?.mode === "FULL_MOVIE" && !input.signageDisplay.videoAssetId) {
      await alert({ title: "入力エラー", message: "FULL_MOVIE のサイネージ表示には動画を選択してください。", variant: "warning" });
      return;
    }
    if (hasDuplicateNewsPresetName(presets, input.name, form.id || undefined)) {
      await alert({ title: "プリセット名が重複しています", message: "別のプリセット名を入力してください。", variant: "warning" });
      return;
    }
    await saveNewsPreset(input, form.id || undefined);
    setForm(EMPTY_FORM);
    setIsFormOpen(false);
  };

  const selectedBreakingVideo = videoLibrary.find(video => video.id === form.breakingVideoId);
  const selectedSignageVideo = videoLibrary.find(video => video.id === form.signageVideoAssetId);
  const renderVideoMeta = (video: VideoLibraryItem | undefined, toneClassName: string) => (
    video?.videoAsset ? (
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface p-2">
        <p className={`truncate text-[10px] font-black ${toneClassName}`}>
          {getOptimizedStatusLabel(video.videoAsset)} / {formatVideoBytes(getPreferredVideoAsset(video.videoAsset)?.size)}
        </p>
        <VideoAssetActions asset={video.videoAsset} title={video.name} onPreview={(asset, title) => setPreview({ asset, title })} />
      </div>
    ) : null
  );

  const handleDelete = async (preset: NewsPreset) => {
    const isOk = await confirm({
      title: "ニュースプリセットを削除",
      message: `「${preset.name}」を削除します。既にシナリオで参照している場合、ニュース本文を解決できなくなります。`,
      confirmText: "削除する",
      variant: "danger",
    });
    if (!isOk) return;
    await deleteNewsPreset(preset.id);
    setSelectedPresetIds(prev => {
      const next = new Set(prev);
      next.delete(preset.id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedPresets.length === 0) return;
    const isOk = await confirm({
      title: "選択したニュースプリセットを削除",
      message: `${selectedPresets.length}件のプリセットを削除します。既にシナリオで参照している場合、ニュース本文を解決できなくなります。`,
      confirmText: "削除する",
      variant: "danger",
    });
    if (!isOk) return;
    await deleteNewsPresets(selectedPresets.map(preset => preset.id));
    setSelectedPresetIds(new Set());
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-on-surface">
            <Newspaper className="text-primary" /> ニュースプリセット
          </h1>
          <p className="mt-1 text-sm font-bold text-on-surface-variant">
            表ニュース、事後ニュース、インサイダー情報で共通利用するニュース文面を管理します。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <NewsPresetCsvImporter presets={presets} />
          <Button onClick={startCreate}><Plus size={18} className="mr-2" /> 新規作成</Button>
        </div>
      </div>

      {isFormOpen && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">{form.id ? "プリセット編集" : "新規プリセット作成"}</CardTitle>
            <IconButton aria-label="フォームを閉じる" size="sm" variant="ghost" onClick={() => setIsFormOpen(false)}>
              <X size={16} />
            </IconButton>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="プリセット名" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
            <Input label="見出し" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} />
            <div className="md:col-span-2">
              <Textarea label="本文" rows={5} value={form.body} onChange={e => setForm(prev => ({ ...prev, body: e.target.value }))} />
            </div>
            <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4 dark:border-purple-900/50 dark:bg-purple-950/10">
              <label className="mb-2 flex items-center gap-2 text-xs font-black text-on-surface-variant">
                <Film size={14} /> 速報動画
              </label>
              <Select value={form.breakingVideoId} onChange={e => setForm(prev => ({ ...prev, breakingVideoId: e.target.value }))}>
                <option value="">なし</option>
                {videoLibrary.map(video => <option key={video.id} value={video.id}>{video.name}</option>)}
              </Select>
              {selectedBreakingVideo && (
                <p className="mt-2 truncate text-xs font-bold text-on-surface"><Cloud size={12} className="mr-1 inline text-purple-500" />{selectedBreakingVideo.name}</p>
              )}
              {renderVideoMeta(selectedBreakingVideo, "text-purple-500")}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/50 dark:bg-blue-950/10">
              <label className="mb-3 flex items-center gap-2 text-xs font-black text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={form.signageEnabled}
                  onChange={e => setForm(prev => ({ ...prev, signageEnabled: e.target.checked }))}
                  className="h-4 w-4 accent-blue-600"
                />
                <Tv size={14} /> サイネージ表示を設定
              </label>
              {form.signageEnabled && (
                <div className="space-y-3">
                  <Select value={form.signageMode} onChange={e => setForm(prev => ({ ...prev, signageMode: e.target.value }))}>
                    {PUBLIC_SIGNAGE_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                  </Select>
                  <div className="grid grid-cols-2 gap-3">
                    <Input type="number" min="5" label="表示秒数" value={form.signageDuration} onChange={e => setForm(prev => ({ ...prev, signageDuration: Number(e.target.value) }))} />
                    <Select value={form.signageKind} onChange={e => setForm(prev => ({ ...prev, signageKind: e.target.value as "NORMAL" | "AD" }))}>
                      <option value="NORMAL">通常表示</option>
                      <option value="AD">広告動画</option>
                    </Select>
                  </div>
                  {form.signageMode === "FULL_MOVIE" && (
                    <div>
                      <Select value={form.signageVideoAssetId} onChange={e => setForm(prev => ({ ...prev, signageVideoAssetId: e.target.value }))}>
                        <option value="">動画を選択</option>
                        {videoLibrary.map(video => <option key={video.id} value={video.id}>{video.name}</option>)}
                      </Select>
                      {renderVideoMeta(selectedSignageVideo, "text-blue-500")}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button variant="outline" onClick={() => setIsFormOpen(false)}>キャンセル</Button>
              <Button onClick={handleSave}>保存</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3">
              <Search size={16} className="text-on-surface-variant" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="プリセット名・見出しで検索"
                className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAllVisible}
                disabled={filteredPresets.length === 0}
              >
                <CheckSquare size={16} className="mr-2" />
                {isAllVisibleSelected ? "表示中を解除" : "表示中を選択"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={selectedPresets.length === 0}
              >
                選択解除
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={selectedPresets.length === 0}
              >
                <Trash2 size={16} className="mr-2" />
                選択削除 {selectedPresets.length > 0 ? `(${selectedPresets.length})` : ""}
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
            <div className="grid min-h-11 grid-cols-[44px_minmax(150px,0.8fr)_minmax(180px,1fr)_minmax(220px,1.4fr)_96px_104px] items-center gap-3 border-b border-outline-variant bg-surface-container px-3 text-xs font-black text-on-surface-variant max-lg:hidden">
              <div className="text-center">選択</div>
              <div>プリセット名</div>
              <div>見出し</div>
              <div>本文</div>
              <div>演出</div>
              <div className="text-center">操作</div>
            </div>
            <div className="divide-y divide-outline-variant">
              {filteredPresets.map(preset => {
                const isSelected = selectedPresetIds.has(preset.id);
                return (
                  <div
                    key={preset.id}
                    className={`grid grid-cols-[32px_minmax(0,1fr)_88px] gap-3 px-3 py-3 transition-colors lg:grid-cols-[44px_minmax(150px,0.8fr)_minmax(180px,1fr)_minmax(220px,1.4fr)_96px_104px] lg:items-center ${isSelected ? "bg-primary/8" : "bg-surface"}`}
                  >
                    <label className="flex items-start justify-center pt-1 lg:pt-0">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-primary"
                        checked={isSelected}
                        onChange={() => toggleSelectPreset(preset.id)}
                        aria-label={`${preset.name}を選択`}
                      />
                    </label>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-primary">{preset.name}</p>
                      <p className="mt-1 line-clamp-2 text-base font-black text-on-surface lg:hidden">{preset.title}</p>
                      <p className="mt-2 line-clamp-3 text-sm font-medium leading-relaxed text-on-surface-variant lg:hidden">{preset.body}</p>
                      {(preset.breakingVideoId || preset.signageDisplay) && <p className="mt-2 text-[11px] font-black text-blue-600 lg:hidden">演出あり</p>}
                    </div>
                    <div className="hidden min-w-0 lg:block">
                      <p className="line-clamp-2 text-sm font-bold text-on-surface">{preset.title}</p>
                    </div>
                    <div className="hidden min-w-0 lg:block">
                      <p className="line-clamp-2 text-sm font-medium leading-relaxed text-on-surface-variant">{preset.body}</p>
                    </div>
                    <div className="hidden min-w-0 lg:block">
                      {(preset.breakingVideoId || preset.signageDisplay)
                        ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">演出あり</span>
                        : <span className="text-xs font-bold text-on-surface-variant">なし</span>}
                    </div>
                    <div className="flex shrink-0 items-start justify-end gap-1 lg:items-center lg:justify-center">
                      <IconButton aria-label={`${preset.name}を編集`} size="sm" variant="outline" onClick={() => startEdit(preset)}>
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton aria-label={`${preset.name}を削除`} size="sm" variant="outline" className="text-error" onClick={() => handleDelete(preset)}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
              {filteredPresets.length === 0 && (
                <div className="px-4 py-8 text-sm font-bold text-on-surface-variant">
                  該当するニュースプリセットがありません。
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <VideoPreviewModal asset={preview?.asset} title={preview?.title || ""} isOpen={!!preview} onClose={() => setPreview(null)} />
    </div>
  );
}
