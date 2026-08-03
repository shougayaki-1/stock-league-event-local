import { Users, AlertTriangle } from "lucide-react";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import type { User } from "../../../types/domain";
import { Card, CardContent } from "../../ui/Card";

interface Props {
  searchResults: User[];
  cancelSelection: () => void;
  selectUserFromResult: (user: User) => void;
}

export default function SearchResultList({ searchResults, cancelSelection, selectUserFromResult }: Props) {
  if (searchResults.length === 0) return null;

  return (
    <Card className="mb-8 border-red-200 dark:border-red-900/50 shadow-lg">
      <div className="bg-red-50 dark:bg-red-900/20 px-6 py-4 border-b border-red-100 dark:border-red-900/50 flex justify-between items-center">
        <h3 className="font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle size={18} /> 同一のIDが複数見つかりました
        </h3>
        <Button variant="ghost" size="sm" onClick={cancelSelection} className="text-red-500">キャンセル</Button>
      </div>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {searchResults.map(u => (
            <div key={u.uid} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition gap-4">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full shrink-0"><Users size={20} className="text-slate-500" /></div>
                <div>
                  <p className="font-black text-slate-800 dark:text-white text-base md:text-lg">{u.nickname}</p>
                  <p className="text-xs text-slate-400 font-mono tracking-widest">{u.uid}</p>
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4">
                <Badge variant={u.courseType === "INSIDER" ? "danger" : "info"}>{u.courseType}</Badge>
                <Button variant="outline" size="sm" onClick={() => selectUserFromResult(u)}>選択</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}