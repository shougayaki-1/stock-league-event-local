import React from "react";
import { Camera, WifiOff } from "lucide-react";
import Input from "../../ui/Input";
import Button from "../../ui/Button";

interface SearchBarProps {
  mode: "trade" | "exchange" | "reception";
  searchInput: string;
  suggestText: string;
  loading: boolean;
  isScanning: boolean;
  showMemo: boolean;
  setIsScanning: (val: boolean) => void;
  setShowMemo: (val: boolean) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  executeCommandOrSearch: (input: string) => void;
  addOfflineMemo: (id: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export default function SearchBar({
  mode,
  searchInput,
  suggestText,
  loading,
  isScanning,
  showMemo,
  setIsScanning,
  setShowMemo,
  handleInputChange,
  handleKeyDown,
  executeCommandOrSearch,
  addOfflineMemo,
  inputRef
}: SearchBarProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row gap-4">
        <form
          onSubmit={(e) => { e.preventDefault(); executeCommandOrSearch(searchInput); }}
          className="flex-1 flex gap-2 relative"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={suggestText}
              readOnly
              className="absolute inset-0 w-full px-4 py-3 bg-transparent border border-transparent rounded-xl outline-none font-mono text-xl text-slate-300 dark:text-slate-600 pointer-events-none z-0"
            />
            <Input
              ref={inputRef}
              autoFocus
              type="text"
              value={searchInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={mode === "trade" ? "例: 1234 / 1234 トヨタ BUY 10" : "ID 4桁..."}
              className="font-mono text-xl relative z-10 bg-transparent"
            />
          </div>
          <Button type="submit" isLoading={loading} disabled={!searchInput} size="lg" className="shrink-0 px-6">
            実行/検索
          </Button>
        </form>
        <div className="flex gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            className="flex-1 md:flex-none"
            onClick={() => { if (searchInput) addOfflineMemo(searchInput); else setShowMemo(!showMemo); }}
          >
            <WifiOff size={18} className="mr-2" /> {searchInput ? "メモする" : "メモ帳"}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 md:flex-none"
            onClick={() => setIsScanning(!isScanning)}
          >
            <Camera size={18} className="mr-2" /> {isScanning ? "閉じる" : "QR"}
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 mt-2 font-bold">
        ※コマンド入力中、<kbd className="bg-slate-100 dark:bg-slate-800 px-1 rounded">Tab</kbd>キーで予測変換を確定できます。
      </p>
    </>
  );
}