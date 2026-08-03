import { Trophy } from "lucide-react";
import { formatExact } from "../../../lib/exactNumber";
import { useAllUsersRanking } from "../../../hooks/useFirebase";
import Badge from "../../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/Card";

export default function RankingPanel() {
  const users = useAllUsersRanking().slice(0, 10);

  return (
    <Card className="min-h-0">
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-base"><Trophy size={18} /> ランキングTOP</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto p-4">
        <div className="space-y-2">
          {users.map((user, index) => (
            <div key={user.uid ?? user.shortId ?? index} className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Badge variant={index < 3 ? "warning" : "default"} className="w-9 justify-center">#{index + 1}</Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-on-surface">{user.nickname || "名無し"}</p>
                  <p className="text-[10px] font-bold text-on-surface-variant">No.{user.shortId || "----"}</p>
                </div>
              </div>
              <p className="shrink-0 font-mono text-sm font-black text-on-surface">{formatExact(user.totalAssets ?? user.points)} pt</p>
            </div>
          ))}
          {users.length === 0 && <p className="py-8 text-center text-sm font-black text-on-surface-variant">ランキング集計待ちです。</p>}
        </div>
      </CardContent>
    </Card>
  );
}
