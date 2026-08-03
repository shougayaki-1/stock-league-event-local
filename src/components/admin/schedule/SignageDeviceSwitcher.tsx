import { PUBLIC_SIGNAGE_PRESETS } from "../../../lib/signagePresets";
import ScreenMockup from "../../ui/ScreenMockup";

interface Props {
  signages: Array<{ id: string; name: string; location: string; liveMode?: string | null; manualOverride?: { mode: string } | null }>;
  selectedSignageId: string;
  onSelectSignage: (id: string) => void;
  onSelectPreset: (signageId: string, presetId: string | null) => void;
}

export default function SignageDeviceSwitcher({ signages, selectedSignageId, onSelectSignage, onSelectPreset }: Props) {
  const selected = signages.find(signage => signage.id === selectedSignageId);
  const selectedMode = selected?.manualOverride?.mode || selected?.liveMode || null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap gap-2">
        {signages.map(signage => (
          <button
            key={signage.id}
            type="button"
            onClick={() => onSelectSignage(signage.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-black ${selectedSignageId === signage.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
          >
            {signage.name}
          </button>
        ))}
      </div>
      {selected && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <button type="button" onClick={() => onSelectPreset(selected.id, null)} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-left text-[11px] font-black dark:border-slate-800 dark:bg-slate-950">
            自動に戻す
          </button>
          {PUBLIC_SIGNAGE_PRESETS.filter(preset => preset.id !== "FULL_MOVIE").map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(selected.id, preset.id)}
              className={`rounded-lg border p-2 text-left transition ${selectedMode === preset.id ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"}`}
            >
              <ScreenMockup mode={preset.id} />
              <p className="mt-2 truncate text-[11px] font-black">{preset.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
