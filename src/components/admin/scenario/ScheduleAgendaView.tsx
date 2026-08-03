import { CheckCircle2, Clock3, Circle } from "lucide-react";
import type { ScenarioEvent } from "../../../types/scenario";
import type { ScheduleSession } from "../../../types/schedule";
import type { NewsPreset } from "../../../types/newsPreset";
import { cn } from "../../../lib/utils";
import { eventMillisForSession, labelForEvent, laneForEvent } from "../schedule/scheduleDisplay";

interface Props {
  session: ScheduleSession;
  events: ScenarioEvent[];
  now: Date;
  videoNameById: Record<string, string>;
  signageNameById: Record<string, string>;
  newsPresetById?: Map<string, NewsPreset>;
  onOpenEdit: (event: ScenarioEvent) => void;
}

const formatDateTime = (date: Date) => date.toLocaleString("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatTime = (date: Date) => date.toLocaleTimeString("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

const formatOffset = (offsetSeconds: number) => {
  const minutes = Math.floor(offsetSeconds / 60);
  const seconds = Math.abs(offsetSeconds % 60);
  return `+${minutes}:${String(seconds).padStart(2, "0")}`;
};

export default function ScheduleAgendaView({
  session,
  events,
  now,
  videoNameById,
  signageNameById,
  newsPresetById = new Map(),
  onOpenEdit,
}: Props) {
  const sessionStartMillis = session.startAt.toMillis();
  const sortedEvents = [...events].sort((a, b) => eventMillisForSession(a, sessionStartMillis) - eventMillisForSession(b, sessionStartMillis));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black text-purple-600 dark:text-purple-300">{session.name}</p>
          <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-50">タイムスケジュール</h3>
          <p className="mt-1 text-[11px] font-bold text-slate-400">
            {formatDateTime(session.startAt.toDate())} - {formatDateTime(session.endAt.toDate())}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-300">
          <Clock3 size={15} className="text-purple-500" />
          <span>{events.length} 件</span>
        </div>
      </div>

      {sortedEvents.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-16 text-center dark:bg-slate-950/45">
          <Clock3 size={42} className="mb-3 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-black text-slate-500 dark:text-slate-300">イベントがありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedEvents.map(event => {
            const eventMillis = eventMillisForSession(event, sessionStartMillis);
            const eventDate = new Date(eventMillis);
            const lane = laneForEvent(event, newsPresetById);
            const title = labelForEvent(event, videoNameById, signageNameById, newsPresetById);
            const isProcessed = event.isProcessed;
            const isDue = !isProcessed && eventMillis <= now.getTime();

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpenEdit(event)}
                className={cn(
                  "group grid w-full grid-cols-[86px_minmax(0,1fr)] gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500 sm:grid-cols-[104px_minmax(0,1fr)]",
                  isProcessed
                    ? "border-slate-200 bg-slate-50/80 opacity-75 dark:border-slate-800 dark:bg-slate-950/35"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                )}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-mono text-2xl font-black leading-none text-slate-900 dark:text-slate-50">{formatTime(eventDate)}</span>
                  <span className="font-mono text-[10px] font-bold text-slate-400">{formatOffset(event.offsetSeconds || 0)}</span>
                </div>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black ring-1", lane.badgeClassName)}>
                      {lane.name}
                    </span>
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black",
                      isProcessed
                        ? "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
                        : isDue
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900"
                        : "bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700"
                    )}>
                      {isProcessed ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                      {isProcessed ? "処理済み" : isDue ? "時刻到達" : "未処理"}
                    </span>
                  </div>
                  <p className="truncate text-base font-black text-slate-800 group-hover:text-purple-700 dark:text-slate-100 dark:group-hover:text-purple-200">
                    {title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
