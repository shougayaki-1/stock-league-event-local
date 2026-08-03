import { Newspaper, Trash2 } from "lucide-react";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/Card";
import { useLiveNews } from "../../../hooks/useLiveNews";
import { useScenarioOperations } from "../../../hooks/useScenarioOperations";

export default function NewsHistoryPanel() {
  const { news, errorMessage } = useLiveNews(30);
  const { deleteLiveNews } = useScenarioOperations();

  return (
    <Card className="min-h-0">
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-base"><Newspaper size={18} /> 配信済みニュース</CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 overflow-y-auto p-4">
        {errorMessage ? (
          <p className="rounded-lg border border-error/30 bg-error-container p-3 text-xs font-bold text-error">{errorMessage}</p>
        ) : <div className="space-y-2">
          {news.map(item => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container p-3">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant={item.target === "INSIDER" ? "warning" : "info"}>{item.target === "INSIDER" ? "裏" : "表"}</Badge>
                  <span className="text-[10px] font-bold text-on-surface-variant">{item.timestamp?.toDate().toLocaleTimeString("ja-JP") || "配信中"}</span>
                </div>
                <p className="truncate text-sm font-black text-on-surface">{item.title}</p>
                <p className="line-clamp-2 text-xs font-bold text-on-surface-variant">{item.body}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-11 w-11 shrink-0 px-0" title="取り下げ" onClick={() => deleteLiveNews(item.id, item.title)}>
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
          {news.length === 0 && <p className="py-8 text-center text-sm font-black text-on-surface-variant">配信済みニュースはありません。</p>}
        </div>}
      </CardContent>
    </Card>
  );
}
