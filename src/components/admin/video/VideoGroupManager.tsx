import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import IconButton from "../../ui/IconButton";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/Card";
import type { VideoGroup } from "../../../types/videoGroup";

export interface VideoGroupManagerProps {
  groups: VideoGroup[];
  videoCountByGroupId: Record<string, number>;
  onCreate: () => void;
  onRename: (group: VideoGroup) => void;
  onDelete: (group: VideoGroup) => void;
}

export default function VideoGroupManager({ groups, videoCountByGroupId, onCreate, onRename, onDelete }: VideoGroupManagerProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">動画グループ</CardTitle>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-on-primary"
        >
          <FolderPlus size={14} />
          新しいグループ
        </button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {groups.length === 0 ? (
          <p className="text-xs font-bold text-on-surface-variant">グループはまだありません。</p>
        ) : (
          groups.map(group => (
            <div
              key={group.id}
              className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-3 py-1.5 text-xs font-bold text-on-surface"
            >
              <span>{group.name}</span>
              <span className="text-on-surface-variant">{videoCountByGroupId[group.id] || 0}件</span>
              <IconButton aria-label={`${group.name}をリネーム`} size="sm" variant="ghost" onClick={() => onRename(group)}>
                <Pencil size={13} />
              </IconButton>
              <IconButton aria-label={`${group.name}を削除`} size="sm" variant="ghost" className="text-error" onClick={() => onDelete(group)}>
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
