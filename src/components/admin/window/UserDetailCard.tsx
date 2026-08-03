import Badge from "../../ui/Badge";
import type { User } from "../../../types/domain";
import { Card, CardContent } from "../../ui/Card";
import { formatExact } from "../../../lib/exactNumber";

interface Props {
  user: User;
  themeColorClass: string;
  children: React.ReactNode;
}

export default function UserDetailCard({ user, themeColorClass, children }: Props) {
  return (
    <Card className="border-blue-200 dark:border-blue-900/30 overflow-hidden shadow-lg animate-in slide-in-from-bottom-4">
      <div className="bg-slate-50 dark:bg-slate-800/50 px-4 md:px-8 py-4 md:py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
        <div>
          <Badge variant={user.courseType === "INSIDER" ? "danger" : "info"}>
            {user.courseType} AGENT
          </Badge>
          <h3 className="text-xl md:text-3xl font-black mt-2 md:mt-3 text-slate-800 dark:text-white">{user.nickname || "名前未設定"}</h3>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Balance</p>
          <p className={`text-2xl md:text-4xl font-mono font-black ${themeColorClass}`}>{formatExact(user.points)} <span className="text-sm md:text-base">pt</span></p>
        </div>
      </div>
      <CardContent className="bg-slate-50/50 dark:bg-transparent p-4 md:p-6">
        {children}
      </CardContent>
    </Card>
  );
}
