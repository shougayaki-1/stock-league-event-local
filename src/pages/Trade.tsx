import { useTradePage } from "../hooks/useTradePage";
import { useChartHistory } from "../hooks/useFirebase";
import { useTheme } from "../contexts/ThemeContext";
import { getLoginId } from "../lib/utils";
import { addExact, mulExact, toExactString } from "../lib/exactNumber";

import MarketTab from "../components/trade/MarketTab";
import NewsTab from "../components/trade/NewsTab";
import InfoTab from "../components/trade/InfoTab";
import SettingsTab from "../components/trade/SettingsTab";
import OnboardingOverlay from "../components/trade/OnboardingOverlay";
import TradeActionModal from "../components/trade/TradeActionModal";
import HistoryModal from "../components/trade/HistoryModal";
import QrModal from "../components/trade/QrModal";
import TradeHeader from "../components/trade/TradeHeader";
import TradeBottomNav from "../components/trade/TradeBottomNav";
import TradeOverlays from "../components/trade/TradeOverlays";
import InitialSetupScreen from "../components/trade/InitialSetupScreen";

export default function Trade() {
  const { theme, setTheme } = useTheme();
  const chartData = useChartHistory();

  const {
    user,
    stocks,
    transactions,
    transactionErrorMessage,
    news,
    ranking,
    totalAgents,
    activeTab,
    setActiveTab,
    isHistoryOpen,
    setIsHistoryOpen,
    isQrModalOpen,
    setIsQrModalOpen,
    newNickname,
    setNewNickname,
    isLoading,
    needsInitialSetup,
    setupNickname,
    setSetupNickname,
    handleInitialSetup,
    flashState,
    toastNews,
    tradeSuccessToast,
    isMarketClosed,
    showEmergencyOverlay,
    showEmergencyResolvedOverlay,
    emergencyConfig,
    tradeSuccessFlash,
    tradeModal,
    setTradeModal,
    tradeAmount,
    setTradeAmount,
    isMaxAmount,
    tradeQuote,
    isQuoteLoading,
    quoteError,
    quoteRemainingMillis,
    openTradeModal,
    handleMaxAmount,
    executeTrade,
    handleLogout,
    handleUpdateNickname,
    handleFinalize
  } = useTradePage();

  // 利益確定後もスマホから取引を継続できる。確定済みであることは
  // ユーザーデータの isFinished として保持され、画面上でも表示する。
  if (!user) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex justify-center items-center">
        <div className="animate-pulse text-blue-500 font-bold tracking-widest">
          LOADING SECURE DATA...
        </div>
      </div>
    );
  }

  if (needsInitialSetup) {
    return (
      <InitialSetupScreen
        setupNickname={setupNickname}
        setSetupNickname={setSetupNickname}
        handleInitialSetup={handleInitialSetup}
        isLoading={isLoading}
      />
    );
  }

  const myRankIndex = ranking.findIndex(u => u.uid === user.uid);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : "上位外";
  const displayedTotalAgents = Math.max(totalAgents, ranking.length, 1);
  const totalAssets = Object.entries(user.inventory || {}).reduce(
    (total, [stockId, amount]) => {
      const stock = stocks.find((item) => item.id === stockId);
      return stock ? addExact(total, mulExact(amount, stock.currentPrice)) : total;
    },
    toExactString(user.points)
  );

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans flex flex-col relative transition-colors duration-300">

      <OnboardingOverlay />

      <TradeOverlays
        showEmergencyOverlay={showEmergencyOverlay}
        showEmergencyResolvedOverlay={showEmergencyResolvedOverlay}
        emergencyConfig={emergencyConfig}
        isMarketClosed={isMarketClosed}
        toastNews={toastNews}
        tradeSuccessToast={tradeSuccessToast}
        tradeSuccessFlash={tradeSuccessFlash}
        isTradeProcessing={isLoading && tradeModal.isOpen}
      />

      <TradeActionModal
        user={user}
        isOpen={tradeModal.isOpen}
        stock={tradeModal.stock ? (stocks.find(s => s.id === tradeModal.stock!.id) || tradeModal.stock) : null}
        type={tradeModal.type}
        onClose={() => setTradeModal({ isOpen: false, stock: null, type: null })}
        tradeAmount={tradeAmount}
        setTradeAmount={setTradeAmount}
        handleMaxAmount={handleMaxAmount}
        executeTrade={executeTrade}
        isLoading={isLoading}
        isMarketClosed={isMarketClosed}
        isMaxAmount={isMaxAmount}
        quotePrice={tradeQuote?.price ?? null}
        quoteRemainingMillis={quoteRemainingMillis}
        isQuoteLoading={isQuoteLoading}
        quoteError={quoteError}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        transactions={transactions}
        stocks={stocks}
        errorMessage={transactionErrorMessage}
      />

      <QrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        nickname={user.nickname}
        uid={getLoginId(user)}
      />

      <TradeHeader
        user={user}
        totalAssets={totalAssets}
        emergencyConfig={emergencyConfig}
        myRank={myRank}
        totalAgents={displayedTotalAgents}
        setIsQrModalOpen={setIsQrModalOpen}
        setIsHistoryOpen={setIsHistoryOpen}
      />

      <main className={`flex-1 overflow-y-auto p-4 md:p-8 w-full max-w-5xl mx-auto transition-opacity ${isMarketClosed ? "opacity-50 grayscale-50" : ""}`}>
        <div className="space-y-8 pb-4">
          {activeTab === "market" && (
            <MarketTab
              user={user}
              stocks={stocks}
              news={news}
              chartData={chartData}
              transactions={transactions}
              flashState={flashState}
              openTradeModal={openTradeModal}
              isLoading={isLoading}
              isMarketClosed={isMarketClosed}
            />
          )}
          {activeTab === "news" && <NewsTab news={news} stocks={stocks} />}
          {activeTab === "help" && <InfoTab user={user} />}
          {activeTab === "settings" && (
            <SettingsTab
              user={user}
              newNickname={newNickname}
              setNewNickname={setNewNickname}
              handleUpdateNickname={handleUpdateNickname}
              isLoading={isLoading}
              theme={theme}
              setTheme={setTheme}
              handleFinalize={handleFinalize}
              handleLogout={handleLogout}
            />
          )}
          <div className="h-32 w-full pointer-events-none opacity-0"></div>
        </div>
      </main>

      <TradeBottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

    </div>
  );
}
