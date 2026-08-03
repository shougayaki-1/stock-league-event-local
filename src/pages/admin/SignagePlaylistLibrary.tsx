import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { PlaySquare, Plus, Trash2, Pencil } from "lucide-react";
import { db } from "../../lib/firebase";
import { FIRESTORE_COLLECTIONS } from "../../lib/firestorePaths";
import { VIDEO_LIBRARY_COLLECTION, type VideoLibraryItem } from "../../types/videoLibrary";
import { VIDEO_GROUPS_COLLECTION, type VideoGroup } from "../../types/videoGroup";
import { IMAGE_LIBRARY_COLLECTION, type ImageLibraryItem } from "../../types/imageLibrary";
import type { SignagePlaylist } from "../../types/signagePlaylist";
import type { PlaylistItem } from "../../lib/signagePresets";
import type { CloudVideoAsset } from "../../lib/cloudVideos";
import type { CloudImageAsset } from "../../lib/cloudImages";
import { PLAYLIST_TIMING } from "../../lib/appConstants";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import IconButton from "../../components/ui/IconButton";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { useDialog } from "../../contexts/DialogContext";
import PlaylistItemsEditor from "../../components/admin/signage/PlaylistItemsEditor";
import VideoPreviewModal from "../../components/admin/video/VideoPreviewModal";
import ImagePreviewModal from "../../components/admin/image/ImagePreviewModal";

const DEFAULT_ITEMS: PlaylistItem[] = [{ mode: "FULL_MOVIE", duration: 30 }];

export default function SignagePlaylistLibrary() {
  const [playlists, setPlaylists] = useState<SignagePlaylist[]>([]);
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [imageLibrary, setImageLibrary] = useState<ImageLibraryItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [preview, setPreview] = useState<{ asset: CloudVideoAsset; title: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<{ asset: CloudImageAsset; title: string } | null>(null);
  const { alert, confirm, prompt } = useDialog();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, FIRESTORE_COLLECTIONS.signagePlaylists), (snap) => {
      setPlaylists(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignagePlaylist)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
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

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      await alert({ title: "入力エラー", message: "プレイリスト名を入力してください。", variant: "warning" });
      return;
    }
    const docRef = doc(collection(db, FIRESTORE_COLLECTIONS.signagePlaylists));
    await setDoc(docRef, {
      name: trimmedName,
      items: DEFAULT_ITEMS,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setNewName("");
    setShowAddForm(false);
  };

  const handleItemsChange = async (playlistId: string, items: PlaylistItem[]) => {
    await setDoc(doc(db, FIRESTORE_COLLECTIONS.signagePlaylists, playlistId), { items, updatedAt: Date.now() }, { merge: true });
  };

  const handleRename = async (playlist: SignagePlaylist) => {
    const nextName = await prompt({
      title: "プレイリスト名を変更",
      message: "ライブラリ上の表示名を変更します。",
      defaultValue: playlist.name,
      placeholder: "プレイリスト名",
      confirmText: "変更を保存",
    });
    if (nextName === null) return;
    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === playlist.name) return;
    await setDoc(doc(db, FIRESTORE_COLLECTIONS.signagePlaylists, playlist.id), { name: trimmedName, updatedAt: Date.now() }, { merge: true });
  };

  const handleDelete = async (playlist: SignagePlaylist) => {
    const isOk = await confirm({
      title: "プレイリストを削除",
      message: `「${playlist.name}」をライブラリから削除します。既にモニターへ送出済みの再生には影響しません。`,
      confirmText: "削除する",
      variant: "danger",
    });
    if (!isOk) return;
    await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.signagePlaylists, playlist.id));
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto w-full space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-800 dark:text-white">
            <PlaySquare className="text-emerald-500" /> プレイリストライブラリ
          </h1>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
            CM動画やプリセット画面を組み合わせた名前付きプレイリストを作成し、一般モニター管理から呼び出せます。
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}><Plus size={18} className="mr-2" /> 新規プレイリスト作成</Button>
      </div>

      {showAddForm && (
        <Card className="bg-emerald-50/30 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/50">
          <CardContent className="pt-6 flex flex-col md:flex-row gap-4 md:items-end">
            <Input label="プレイリスト名" value={newName} onChange={e => setNewName(e.target.value)} />
            <Button className="shrink-0 h-[46px] w-full md:w-auto" onClick={handleAdd}>作成</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {playlists.length === 0 && (
          <p className="text-sm font-bold text-slate-400">まだプレイリストがありません。「新規プレイリスト作成」から追加してください。</p>
        )}
        {playlists.map(playlist => (
          <Card key={playlist.id} className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">{playlist.name}</CardTitle>
              <div className="flex items-center gap-1">
                <IconButton aria-label={`${playlist.name}の名前を変更`} size="sm" variant="outline" onClick={() => handleRename(playlist)}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton aria-label={`${playlist.name}を削除`} size="sm" variant="outline" className="text-error" onClick={() => handleDelete(playlist)}>
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </CardHeader>
            <CardContent>
              <PlaylistItemsEditor
                items={playlist.items || []}
                onChange={items => handleItemsChange(playlist.id, items)}
                videoLibrary={videoLibrary}
                videoGroups={videoGroups}
                imageLibrary={imageLibrary}
                onPreview={(asset, title) => setPreview({ asset, title })}
                onImagePreview={(asset, title) => setImagePreview({ asset, title })}
                minDurationSeconds={PLAYLIST_TIMING.minDurationSeconds}
                title="プレイリスト内容"
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <VideoPreviewModal asset={preview?.asset} title={preview?.title || ""} isOpen={!!preview} onClose={() => setPreview(null)} />
      <ImagePreviewModal asset={imagePreview?.asset} title={imagePreview?.title || ""} isOpen={!!imagePreview} onClose={() => setImagePreview(null)} />
    </div>
  );
}
