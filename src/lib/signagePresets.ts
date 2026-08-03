export interface PlaylistItem {
  mode: string;
  duration: number;
  videoType?: "URL" | "LOCAL";
  videoUrl?: string;
  videoAssetId?: string;
  imageAssetId?: string;
}

export interface SignagePreset {
  id: string;
  name: string;
  desc: string;
}

export const PUBLIC_SIGNAGE_PRESETS: SignagePreset[] = [
  { id: "TITLE_SCREEN", name: "✨ タイトル画面", desc: "「株価にドキリ！」のイベント開始用タイトルを全画面で表示します。" },
  { id: "RANKING_BOARD", name: "🏆 ランキング特化", desc: "上位1〜10位までの富豪エージェントを大きく表示します。" },
  { id: "NEWS_DASHBOARD", name: "📰 ニュース＆フォーカス", desc: "最新ニュースと、全体の平均株価、注目銘柄を表示します。" },
  { id: "DUAL_NEWS_BOARD", name: "🗞️ 表・後出しニュース", desc: "表ニュースと後出しニュースを左右に1件ずつ大きく表示します。" },
  { id: "STOCK_GRID", name: "🏦 全銘柄グリッド", desc: "全銘柄の株価とミニチャートを画面いっぱいに並べて表示します。" },
  { id: "SPLIT_NEWS_STOCK", name: "🌗 左右分割", desc: "左にニュース、右上に株価、右下に自動ページ切替のランキングを表示します。" },
  { id: "MARKET_CHART", name: "📈 大型チャート", desc: "全銘柄の株価推移を1つの大きな折れ線グラフで表示します。" },
  { id: "TRANSACTION_MONITOR", name: "💻 取引モニター", desc: "リアルタイムな取引ログをサイバー空間風に流し続けます。" },
  { id: "CLASSROOM_GRID", name: "🧑‍🏫 教室グリッド", desc: "入室中の参加者をグリッド表示し、保有状況と総資産を一斉に見せます。" },
  { id: "MC_TRADE_CAST", name: "🎙️ MC実況", desc: "教室内の最新取引と注目銘柄を大きく表示し、MCが実況しやすい画面にします。" },
  { id: "AVERAGE_BOARD", name: "🇯🇵 イベント平均株価 (単一)", desc: "日経平均風の専用画面。全体の平均株価とその詳細を表示します。" },
  { id: "HEATMAP_GRID", name: "🟥🟩 全体ヒートマップ", desc: "証券会社の掲示板のように、全銘柄の騰落を色付きグリッドで表示します。" },
  { id: "FULL_MOVIE", name: "🎬 全画面動画", desc: "指定した動画を全画面で再生し、終了後に次の画面へ移行します。" },
  { id: "FULL_IMAGE", name: "🖼️ 全画面画像", desc: "指定した画像を全画面で表示し、設定時間の経過後に次の画面へ移行します。" }
];
