import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";

type Section = {
  id: string;
  title: string;
  body: ReactNode;
};

type DocumentShellProps = {
  title: string;
  subtitle: string;
  updatedAt: string;
  badge: string;
  sections: Section[];
  backTo?: string;
  backLabel?: string;
};

export default function DocumentShell({
  title,
  subtitle,
  updatedAt,
  badge,
  sections,
  backTo = "/",
  backLabel = "アプリへ戻る"
}: DocumentShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 font-sans">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
          <Link
            to={backTo}
            className="inline-flex w-fit items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </Link>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1 text-xs font-black tracking-widest text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <FileText size={14} />
                {badge}
              </p>
              <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white md:text-5xl">
                  {title}
                </h1>
                <p className="max-w-3xl text-sm font-medium leading-7 text-slate-600 dark:text-slate-300 md:text-base">
                  {subtitle}
                </p>
              </div>
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              最終更新: <time dateTime={updatedAt}>{updatedAt}</time>
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 md:grid-cols-[220px_minmax(0,1fr)] md:px-8">
        <aside className="hidden md:block">
          <nav className="sticky top-8 space-y-1 border-l border-slate-200 pl-4 dark:border-slate-800">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-lg px-3 py-2 text-xs font-black text-slate-500 transition-colors hover:bg-white hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-blue-400"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className="space-y-5">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-xl font-black text-slate-950 dark:text-white md:text-2xl">
                  {section.title}
                </h2>
              </div>
              <div className="space-y-4 text-sm font-medium leading-7 text-slate-600 dark:text-slate-300">
                {section.body}
              </div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
