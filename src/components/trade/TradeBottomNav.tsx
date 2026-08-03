import { TrendingUp, Newspaper, HelpCircle, Settings2 } from "lucide-react";
import { TabButton } from "../ui/Tabs";

type TabType = "market" | "news" | "help" | "settings";

interface TradeBottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export default function TradeBottomNav({ activeTab, setActiveTab }: TradeBottomNavProps) {
  return (
    <nav className="bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 fixed bottom-0 w-full z-20 pb-safe transition-colors duration-300">
      <div className="max-w-5xl mx-auto flex justify-around p-2 gap-1 sm:gap-2 min-h-20 relative">
        <TabButton
          value="market"
          activeValue={activeTab}
          onSelect={setActiveTab}
          variant="bottom"
          tone="blue"
          icon={<TrendingUp size={20} />}
          activeIconClassName="animate-bounce-short"
        >
          <span className="text-xs mt-1 font-black uppercase tracking-wider">Market</span>
        </TabButton>

        <TabButton
          value="news"
          activeValue={activeTab}
          onSelect={setActiveTab}
          variant="bottom"
          tone="emerald"
          icon={<Newspaper size={20} />}
          activeIconClassName="animate-bounce-short"
        >
          <span className="text-xs mt-1 font-black uppercase tracking-wider">News</span>
        </TabButton>

        <TabButton
          value="help"
          activeValue={activeTab}
          onSelect={setActiveTab}
          variant="bottom"
          tone="purple"
          icon={<HelpCircle size={20} />}
          activeIconClassName="animate-bounce-short"
        >
          <span className="text-xs mt-1 font-black uppercase tracking-wider">Help</span>
        </TabButton>

        <TabButton
          value="settings"
          activeValue={activeTab}
          onSelect={setActiveTab}
          variant="bottom"
          tone="slate"
          icon={<Settings2 size={20} />}
          activeIconClassName="animate-spin-slow"
        >
          <span className="text-xs mt-1 font-black uppercase tracking-wider">Settings</span>
        </TabButton>
      </div>
    </nav>
  );
}
