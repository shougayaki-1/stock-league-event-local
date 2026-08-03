import { useState } from "react";
import { createPortal } from "react-dom";
import { Inbox, Plus, Pencil, Trash2, X } from "lucide-react";
import type { ScheduleSession } from "../../../types/schedule";
import Button from "../../ui/Button";
import Input from "../../ui/Input";
import AdminActionMenu from "../AdminActionMenu";
import { UNSCHEDULED_SESSION_ID } from "../../../lib/appConstants";

interface SessionInput {
  name: string;
  startAt: Date;
  endAt: Date;
}

interface Props {
  sessions: ScheduleSession[];
  selectedSessionId: string;
  onSelect: (id: string) => void;
  onCreate: (input: SessionInput) => void;
  onUpdate: (id: string, input: SessionInput) => void;
  onDelete: (id: string) => void;
  eventCountBySessionId?: Record<string, number>;
}

const toDateTimeInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseDateTimeInput = (value: string) => new Date(value);

export default function SessionTabs({ sessions, selectedSessionId, onSelect, onCreate, onUpdate, onDelete, eventCountBySessionId = {} }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const now = new Date();
  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState(toDateTimeInput(now));
  const [endAt, setEndAt] = useState(toDateTimeInput(new Date(now.getTime() + 60 * 60 * 1000)));

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setStartAt(toDateTimeInput(now));
    setEndAt(toDateTimeInput(new Date(now.getTime() + 60 * 60 * 1000)));
    setIsOpen(true);
  };

  const openEdit = (session: ScheduleSession) => {
    setEditingId(session.id);
    setName(session.name);
    setStartAt(toDateTimeInput(session.startAt.toDate()));
    setEndAt(toDateTimeInput(session.endAt.toDate()));
    setIsOpen(true);
  };

  const submit = () => {
    const input = { name: name.trim() || "無題セッション", startAt: parseDateTimeInput(startAt), endAt: parseDateTimeInput(endAt) };
    if (editingId) onUpdate(editingId, input);
    else onCreate(input);
    setIsOpen(false);
  };

  const formContent = (
    <>
      <Input label="名前" value={name} onChange={e => setName(e.target.value)} />
      <Input label="開始" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
      <Input label="終了" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} />
      <Button onClick={submit} className="h-[46px]">{editingId ? "更新" : "追加"}</Button>
    </>
  );

  const selectedSession = sessions.find(s => s.id === selectedSessionId);
  const canEditSelected = selectedSessionId && !selectedSessionId.startsWith("__") && selectedSession;

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-3 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-primary">{selectedSession?.name || "セッション未選択"}</p>
          <p className="text-[10px] font-bold text-on-surface-variant">横にスワイプして切り替え</p>
        </div>
        {canEditSelected && (
          <AdminActionMenu
            items={[
              { label: "セッションを編集", icon: <Pencil size={14} />, onSelect: () => openEdit(selectedSession) },
              { label: "セッションを削除", icon: <Trash2 size={14} />, tone: "danger", onSelect: () => onDelete(selectedSessionId) },
            ]}
          />
        )}
      </div>
      <div className="touch-scroll -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
        {sessions.map(session => {
          const isInbox = session.id === UNSCHEDULED_SESSION_ID;
          const selected = selectedSessionId === session.id;
          const count = eventCountBySessionId[session.id] ?? 0;
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelect(session.id)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-black transition ${
                selected
                  ? isInbox
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-primary text-on-primary shadow-sm"
                  : isInbox
                    ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                    : "bg-surface-container text-on-surface-variant hover:bg-on-surface/8"
              }`}
            >
              {isInbox && <Inbox size={14} />}
              <span>{isInbox ? "仮置き" : session.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                selected ? "bg-white/20 text-current" : "bg-white/80 text-slate-500 dark:bg-slate-900/70 dark:text-slate-300"
              }`}>
                {count}
              </span>
              {isInbox && count === 0 && <span className="hidden text-[9px] opacity-80 sm:inline">空</span>}
            </button>
          );
        })}
        <Button variant="outline" size="sm" onClick={openCreate} className="gap-1 text-xs"><Plus size={14} /> セッション</Button>
        {canEditSelected && (
          <div className="hidden md:block">
            <AdminActionMenu
              items={[
                { label: "セッションを編集", icon: <Pencil size={14} />, onSelect: () => openEdit(selectedSession) },
                { label: "セッションを削除", icon: <Trash2 size={14} />, tone: "danger", onSelect: () => onDelete(selectedSessionId) },
              ]}
            />
          </div>
        )}
      </div>
      {isOpen && (
        <>
          <div className="mt-3 hidden gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950 md:grid md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
            {formContent}
          </div>
          {typeof document !== "undefined" && createPortal(
            <div className="fixed inset-0 z-[1000] flex items-end bg-black/45 p-3 md:hidden">
              <div className="max-h-[88dvh] w-full overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-800 dark:text-slate-100">{editingId ? "セッション編集" : "セッション追加"}</p>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    aria-label="閉じる"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="grid gap-3">
                  {formContent}
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
