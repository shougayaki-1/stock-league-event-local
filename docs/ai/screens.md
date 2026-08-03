# Screen and route guide

この文書は、AIが「この画面で何をすればよいか」「どのデータを読む/書くか」「誰に見せてよいか」を判断するための一覧です。
URLだけでなく、役割・前提・代表操作・注意点をセットで扱います。

## 共通の読み方

- **Read** は画面が参照する主な状態、**Write** は操作で変化する主な状態です。内部の全フィールドを列挙するものではありません。
- **Danger** がある操作は人間の担当者へ対象と影響を示してから実行します。
- 画面が操作できることと、操作すべきことは別です。イベントの進行表・担当者の指示・現在フェーズを確認します。

## 認証・公開入口

### `/login` — 参加者ログイン

- Actor: 参加者、または参加者を補助するスタッフ。
- Purpose: QRコードまたは短い参加者IDから、ローカルFirebase Authの参加者アカウントへ入る。
- Read: `users` の参加者プロフィール、`settings/system` のHelp表示設定。
- Write: Authセッション、初回ニックネーム、必要なオンボーディング状態。
- Flow: ログイン → 初期設定/ニックネーム → `/`。管理者アカウントではなく、参加者IDを使う。
- Caution: `LOADING SECURE DATA...` が続く場合、まずAuthの復元、Firestore Emulator接続、ブラウザの古いPWAキャッシュ、
  参加者ドキュメントの存在を順に確認する。勝手にデータを初期化しない。

### `/admin/login` — 管理者ログイン

- Actor: terminal/general/core管理者。
- Purpose: メール/パスワード認証後、Firestore `admins/{email}` のロールに従って遷移する。
- Read: Authユーザー、`admins`。
- Write: Authセッションのみ。管理者登録自体は `/admin/system`。
- Routing: terminalは通常 `/terminal`、general/coreは `/admin` へ進む。要求元URLがある場合は保護された範囲内で復帰する。
- Caution: 認証できても管理者ドキュメントがなければアクセス拒否。パスワードをログやIssueへ書かない。

### `/info` — Helpへの入口

- Actor: 未認証ユーザー。
- Purpose: `/login?tab=help` 相当へ誘導する情報入口。実体は取引画面のHelpである。
- Caution: `/info` は管理画面ではない。ログイン後Helpを最初に表示するかはシステム設定で決まる。

### `/privacy`, `/terms`

公開文書。状態変更・認証・運用操作はない。イベント参加者へ案内するリンクとして使用する。

## 参加者画面

### `/` — 取引画面

主役となる参加者画面。Help、マーケット、ニュース、取引履歴、設定のタブと、買い/売りモーダルを持つ。

**Read**

- 自分の `users/{uid}`（ポイント、保有株、ニックネーム、確定/入室状態）。
- `stocks` と `public_data/market_for_users`（銘柄・表示価格・価格フェーズ）。
- `public_data/ranking`、`news`、`settings/system`、自分の `transactions`。

**Write**

- サーバーCallable `quoteStockPrice` と `tradeStock` を通じた約定。
- ニックネーム変更、設定タブの端末ローカル設定など。

**画面の使い方**

1. Marketで銘柄カードとチャートを読む。
2. 銘柄を選び、数量またはMAXを選ぶ。
3. 画面の最新価格見積もりを確認して注文する。
4. 通信が遅い/タイムアウトしたら、画面を閉じず履歴と残高を確認する。
5. Newsで表/裏情報を読み、Historyで約定を確認する。
6. 終了条件を満たした場合だけResult/確定導線へ進む。

**AIがしないこと**

- 画面表示の価格を根拠にFirestoreのポイントやinventoryを直接修正する。
- タイムアウトを理由に同じ注文を新しい冪等キーで再送する。
- 他参加者のUIDや履歴を参加者画面へ表示する。

### `/result` — 結果・完了画面

- Actor: 参加者、スタッフ補助。
- Purpose: 最終資産、ミッション完了、コンプライアンス違反などの結果状態を表示し、取引画面へ戻る。
- Read/Write: 自分のユーザー状態、確定Callable。確定ボタンは一回性があるため、連打や別端末からの重複実行を避ける。
- Caution: Resultを開いたことと、サーバー上の最終確定が同義とは限らない。`isFinished` と取引履歴を確認する。

## 端末オペレーション

### `/terminal` — 端末ホーム

- Actor: terminal/general/core。
- Purpose: 端末の用途に応じて注文カード、証券窓口、ポートフォリオ、QR、ジェスチャーのモードを選ぶ。
- Modes: Chromebook注文カード、iPad証券窓口、ポートフォリオビューワー、標準QR、ジェスチャーA/B/C。
- Read/Write: `users`、`stocks`、取引Callable、端末ローカル設定。カメラ・手認識モデルを使うモードではSecure Contextが必要。
- Caution: 端末を共有する場合、別参加者のセッションが残らないよう画面内の戻る/リロード/ログアウトを確認する。

### `/terminal/trade` — 証券窓口 / 売買補助

- Actor: terminal/general/core。
- Purpose: スタッフが参加者ID/QRを照合し、売買を補助する。
- Read: 対象参加者プロフィール、マーケット、取引履歴。
- Write: 通常は参加者本人としてのTrade Callable。オフラインモードでは受付メモ/キューを使い、復帰後に同期する。
- Caution: 「高速受付ログ」は記録の補助であり、約定の正本ではない。ネット切断時メモを約定済みと説明しない。

### `/terminal/exchange` — 景品交換窓口

- Actor: terminal/general/core。
- Purpose: 確定済みポイント・チケット・交換条件を確認し、景品の受け渡しを運営する。
- Read: `users/{uid}`、`settings/prizes`、`isFinished`、`isTicketUsed`。
- Write: チケット使用、交換状態、必要なユーザー更新。
- Caution: 対象者の名前/IDと景品条件を声出し確認。使用済み状態は一回性があり、誤操作をすぐ再実行しない。

### `/terminal/reception` — 受付

- Actor: terminal/general/core。
- Purpose: QR/短いID/ニックネームで参加者を検索し、来場・チェックインを補助する。
- Read: `users`。
- Write: `isInClass` などの在席/受付状態、必要な時刻フィールド。
- Caution: 同名ニックネームをIDの代わりに扱わない。表示された参加者名・短いID・QRを照合する。

### `/terminal/classroom` — 教室入退室

- Actor: terminal/general/core。
- Purpose: 教室TVに表示する対象者と、教室への入室/退室を管理する。
- Read: `users`、`settings/classroom_operation`。
- Write: 参加者の入退室状態と教室表示設定。
- Caution: `isInClass` は取引そのものの許可/拒否ではない。誤った退室を上書きする前に時刻と担当者へ確認する。

### `/terminal/mc` — MCコントロール

- Actor: terminal/general/core。
- Purpose: 現在のフェーズ、シナリオモード、イベント進行、サイネージ送出をMCが把握する。
- Read: `settings/system`、`events`、`schedule_sessions`、`public_signages`、動画・プレイリスト。
- Write: `scenarioMode`、イベントの手動発火、サイネージ手動送出、緊急状態の周辺設定。
- Caution: MCは「観測/発火」の役割。シナリオ内容そのものの編集は `/admin/scenario` で事前に行う。

### `/terminal/signage-riddle` — 謎解き端末管理

- Actor: terminal/general/core。
- Purpose: 謎解き部屋、TV役割、ステップ、タイマー、動画を現場から扱う。
- Read/Write: `riddle_rooms`、`video_library`。
- Caution: 複数TVへ同時に指示するため、部屋ID・役割・現在ステップを必ず確認する。

## 管理画面

### `/admin/market` — 株価・マーケット制御

- Purpose: 銘柄マスター、初期/現在価格、価格フェーズ、CSV、通常/緊急市場状態を管理する。
- Read/Write: `stocks`、`internal/price_engine`、`public_data/market_for_users`、`settings/system`。
- Typical flow: 銘柄登録 → 価格/フェーズ編集 → CSVプレビュー → 保存 → シナリオとの整合確認。
- Danger: 緊急上昇/暴落、停止/再開、価格の直接変更。対象銘柄・発火時刻・表示メッセージを確認する。

### `/admin/scenario` — シナリオ・ニュース予約

- Purpose: 時系列イベント、セッション、価格変動分岐、ニュースプリセット、サイネージ対象を編集・実行する。
- Read/Write: `events`、`schedule_sessions`、`news_presets`、`settings/system`、参照される `stocks`/`public_signages`。
- Modes: タイムライン/アジェンダ、CSVインポート、手動編集、運用・テスト、AUTO開始、イベント発火。
- Danger: イベント発火・開始・リセットは市場と参加者へ即時影響。保存前に時刻・対象・分岐・遅延・対象サイネージを確認する。
- Note: 金曜午前セッションを自動で探して復元する機能は存在しない。

### `/admin/news-presets` — ニュースプリセット

- Purpose: 表/事後/裏ニュースのタイトル・本文、速報動画、サイネージ表示を再利用可能な形で管理する。
- Read/Write: `news_presets`、動画ライブラリ。
- Caution: プリセット変更は、通常は新しく生成されるニュースへ適用するテンプレート変更であり、過去配信を遡及編集する操作ではない。

### `/admin/mc` — MCコントロール

`/terminal/mc` と同じMC機能を管理レイアウトから使う。大画面でイベント全体を確認する場合に使用する。

### `/admin/users` — ID発行・ステータス管理

- Purpose: 参加者の一括/個別作成、短いID、QR、ニックネーム、コース、ポイント、完了状態を管理する。
- Read/Write: `users`、`settings/system`、`stocks`（初期保有/初期値に関係する場合）。
- Typical flow: 初期ポイントと銘柄を確認 → 参加者作成 → QR/ID印刷 → 参加者端末でログイン確認。
- Danger: ポイント・inventory・完了状態の直接変更、複数ユーザーの一括更新。理由と対象リストを残す。

### `/admin/order-cards` — 注文カード印刷

- Purpose: 売買カード、銘柄カード、数量カードを印刷する。
- Read: `stocks`、共通数量プリセット。
- Write: 通常なし（ブラウザ印刷）。表示中のタブだけを印刷する。
- Caution: 印刷物が古い銘柄・数量・日付になっていないか、配布前に確認する。

### `/admin/logs` — リアルタイム取引ログ

- Purpose: 参加者・銘柄・売買・時刻・約定を監視し、問い合わせと不整合を調査する。
- Read: `users`、`stocks`、`public_transactions`、ユーザーの取引サブコレクション。
- Write: 通常なし。取消などは別の保護された操作で、ログを手で修正しない。
- Caution: 表示遅延と約定失敗を混同しない。サーバー応答と履歴の両方を見る。

### `/admin/signage-public` — 一般モニター管理

- Purpose: モニター別の自動モード/手動モード、プレイリスト、動画、ニュース、プレビュー、公開URLを管理する。
- Read/Write: `public_signages`、`signage_playlists`、`video_library`、`image_library`、`news`、`events`。
- Caution: 手動送出は表示端末へ即時影響。正しいモニターIDとプレビュー結果を確認してから送出する。

### `/admin/signage-riddle` — 謎解きエリア管理

- Purpose: 部屋、TVの役割、テーマ、演出ステップ、タイマー、共通動画を管理する。
- Read/Write: `riddle_rooms`、`video_library`。
- Caution: ステップの削除・並べ替えは現場演出を変える。既存端末がどのroleで表示中かを確認する。

### `/admin/video-library` — 動画ライブラリ

- Purpose: 動画のアップロード、名前、グループ、音量ゲイン、プレビュー、削除を管理する。
- Read/Write: `video_library`、`video_groups`相当のグループドキュメント、ローカルStorage Emulatorのアセット。
- Caution: 使用先参照を確認せず削除しない。動画変換にはffmpeg-staticが含まれ、配布時のGPL注意事項がある。

### `/admin/image-library` — 画像ライブラリ

- Purpose: サイネージ画像のアップロード、テンプレート生成画像、名前変更、プレビュー、削除。
- Read/Write: `image_library`、Storage Emulatorのアセット。
- Caution: プレイリスト・サイネージ・テンプレートの参照を確認してから削除する。

### `/admin/image-template-studio` — 画像テンプレート

- Purpose: 注文マット、株価予測、イベント掲示などのテンプレートから画像を生成し、画像ライブラリへ保存する。
- Read/Write: `image_library`。
- Caution: 生成物は自動的に全モニターへ送出されるわけではない。保存後、プレイリストまたは手動送出へ明示的に追加する。

### `/admin/signage-playlists` — プレイリストライブラリ

- Purpose: 動画・画像・プリセット画面を順序付きで組み合わせ、一般モニターから呼び出せる名前付きリストを作る。
- Read/Write: `signage_playlists` と各メディアライブラリ。
- Caution: 削除・アイテム入れ替えは表示内容を変える。使用中モニターと担当者を確認する。

### `/admin/system` — クロージング・景品 / システム設定

- Purpose: 管理者、景品条件、共通数量ボタン、Help Markdown、ログイン後Help、clientVersion、ecoModeを管理する。
- Read/Write: `admins`、`settings/system`、`settings/prizes`、参加者の一部状態。
- Danger: 管理者削除/権限変更、全員利益確定、全リセット、clientVersionによる全端末更新。
- Caution: Help本文は参加者画面に反映される。Markdownに秘密情報、内部URL、管理者用手順を書かない。

### `/admin/manual` — 管理者マニュアル

画面内に埋め込まれた運営向け手順。開場前、窓口、市場、参加者、サイネージ、ログ、クロージングを確認する。
このAI文書がより詳細な概念/データ/障害対応を持ち、画面内マニュアルは現場での短いチェックリストとして扱う。

## サイネージ表示画面

### `/signage?id=<id>` — 旧/簡易サイネージ

- Actor: 表示端末。ログイン不要。
- Purpose: 既存の簡易な市場トレンド・ニュース表示を出す互換ルート。
- Caution: 新しい一般モニターの管理対象は `/signage/public?id=...`。このルートを新規配布する場合は、管理画面の用途と互換性を確認する。

### `/signage/public?id=<id>` — 一般モニター表示

- Actor: 表示端末。ログイン不要。
- Purpose: 株価、ニュース、ランキング、取引、プリセット、動画などを表示する。
- Read: `public_signages/{id}`、`settings/system`、`public_data/*`、`news`、`events`、メディアライブラリ。
- Write: 表示端末のIndexedDBキャッシュ、音声/画面設定。通常のイベントデータは書き換えない。
- Caution: 長時間表示中はPWA更新を自動適用しない。端末のキャッシュ消去は、再ダウンロード時間とネットワークを見積もる。

### `/signage/riddle?roomId=<id>&role=<role>` — 謎解き表示

- Actor: TV表示端末。ログイン不要。
- Purpose: 部屋・TV役割に対応する待機、動画、タイマー、出口などの演出を表示する。
- Read: `riddle_rooms/{id}`、動画ライブラリ。
- Write: IndexedDBのメディアキャッシュ、表示端末の設定。
- Caution: `roomId`と`role`の組み合わせが誤ると、別のTV向け表示になる。管理画面で発行したURLをそのまま使う。

## 画面遷移の基本

```text
/login -> / (participant)
/admin/login -> /terminal (terminal) or /admin (general/core)
/admin -> /admin/market
/info -> /login?tab=help
/admin/trade -> /terminal/trade
/admin/exchange -> /terminal/exchange
/admin/reception -> /terminal/reception
/admin/classroom -> /terminal/classroom
```

保護ルートへ未認証でアクセスした場合はログインへ戻ります。認証済みでもFirestoreのユーザー/管理者ドキュメントが
読み取れない場合、アクセス状態が確定するまで画面を操作可能とみなしてはいけません。
