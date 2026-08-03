# Troubleshooting guide

AIは、症状からいきなりデータ削除やリセットを提案しません。まず「どの端末だけか」「どの時刻からか」「認証済みか」「Firebase Emulatorが生きているか」を切り分けます。

## 1. 診断の順番

### 1.1 影響範囲

- 1ブラウザだけ: PWAキャッシュ、Authセッション、端末URL、ブラウザ権限。
- 1役割/1モニターだけ: `id`、`roomId`、role、プレイリスト、アセット参照。
- 全Web画面: `web`、Firebase Emulator、Functions、Composeネットワーク。
- 取引だけ: `globalPhase`、Callable、quote、Auth、Rules、workerではなくFunctions。
- サイネージだけ: Storage/IndexedDB/音声/自動更新除外。

### 1.2 まず見るコマンド

```sh
docker compose ps
docker compose logs --tail=200 firebase
docker compose logs --tail=200 runner
docker compose logs --tail=200 web
docker compose config -q
```

秘密情報、Authorizationヘッダー、Authトークン、`.env`の内容をログへ貼り付けないでください。

## 2. `LOADING SECURE DATA...` から進まない

### 観測

1. URLが `/login` か `/` か確認する。`/?tab=help`へ残っている場合、認証リダイレクトと古いPWAキャッシュを疑う。
2. `/admin/login` と `/login` を混同していないか確認する。
3. `docker compose ps` で`firebase`/`web`が稼働しているか確認する。
4. Firebase Emulator UI (`:4000`) とブラウザのNetwork/Consoleを確認する。
5. Authにログイン済みだがFirestoreの`users/{uid}`がない場合、参加者ドキュメントとセッションの組み合わせを確認する。

### 安全な復旧

- 新しいブラウザプロファイルまたは`127.0.0.1:8098`でログイン画面を確認する。
- 古いService Worker/Cacheを消す場合、取引中・サイネージ表示中でないことを確認する。
- 管理者は `/admin/login` へ戻り、参加者は `/login` へ戻る。
- `.env`や`data/`を削除して直そうとしない。

## 3. ログインできない

- 初期管理者: Composeの`bootstrap`が成功しているか、`.env`のメール/パスワードが16文字以上か確認。
- 参加者: `/admin/users`で参加者が作成済みか、短いID/QRに誤りがないか確認。
- `admins/{email}`がない: Authユーザーが存在しても管理者ではない。管理者登録を確認する。
- 役割がterminal: `/admin`ではなく`/terminal`へ進むのが正常。
- パスワードやAuthエクスポートをチャットへ貼らない。

## 4. `docker compose up` がポート競合する

### 観測

```sh
docker compose ps
docker ps
```

8098(Web)、4000(UI)、5001(Functions)、8080(Firestore)、8085(Pub/Sub)、9099(Auth)、9199(Storage)のどれが使用中か確認します。

### 復旧

- 既存の別Composeプロジェクトがポートを占有していれば、対象プロジェクトだけを特定して停止する。
- 他システムを推測で停止しない。ユーザーが管理していないコンテナを削除しない。
- `.env`で公開ポートを変更した場合、Webに埋め込まれるEmulatorポートも再ビルドする。

## 5. Firestore/Functionsがつながらない

- Webは常に同じホスト名のEmulatorへ接続する。LAN端末から開く場合、運営PCのIPと公開ポートを確認する。
- FunctionsのCallableエラーは、`firebase`のFunctions Emulatorロード状態と`runner`ログを確認する。
- Rulesエラーは、ログイン中のAuth UID、管理者role、対象コレクションを確認する。
- `firebase`が再起動を繰り返す場合、Java/Emulator UI/データディレクトリ/メモリを確認する。

## 6. 取引が失敗・二重に見える

### 代表的な原因

- 市場が`STOP`。
- quoteが5秒で期限切れ、別のquoteで置き換え、または使用済み。
- 残ポイント/保有株不足。
- Auth UIDと指定uidが不一致。
- タイムアウト後に画面が確認中。

### 復旧手順

1. 参加者IDと対象銘柄を特定。
2. `/admin/logs`と参加者履歴を時刻で照合。
3. `idempotencyKey`相当の注文が存在するか確認。
4. 成功していれば新しい注文を作らず、画面を再表示する。
5. 失敗している場合だけ、現在価格を再取得して参加者へ再注文を案内する。

## 7. 株価・ニュース・シナリオが進まない

- `settings/system.globalPhase`、`scenarioMode`、対象イベントの`isProcessed`を確認。
- AUTOなら`runner`ログ、イベント時刻、セッションのstart/end、`scheduled_post_news.isDelivered`を確認。
- MANUALならMCが正しいイベントを選び、同じイベントを二重発火していないか確認。
- `news_presets`を編集しても過去の`news`が変わらないのは正常な場合がある。
- `public_data/market_for_users`が古い場合、正本`stocks`を直接書き換えずworkerを調査する。

## 8. サイネージが黒画面/古い表示/動画エラー

1. URLの`id`または`roomId`/roleを管理画面の発行URLと比較する。
2. 端末が正しいLAN/運営PCへ接続しているか確認する。
3. 管理画面で対象サイネージが存在し、プレイリスト/アセットが参照可能か確認する。
4. 動画ライブラリの参照チェック、Storage Emulator、IndexedDBキャッシュを確認する。
5. 音声だけならブラウザの自動再生制限とスピーカーを確認する。
6. 表示中にリロード/キャッシュ削除する場合、現場の演出が中断することを承認する。

## 9. MediaPipe/ジェスチャーが動かない

- カメラ権限、Secure Context（localhostまたはHTTPS）、正しいカメラ向き、端末性能を確認。
- 初回イメージビルドでWASM/モデルが取得済みか確認。
- カメラ端末の画面を別タブで大量に開かない。
- ジェスチャーを使えない場合、標準QR/注文カードモードへ切り替える運用代替を用意する。

## 10. データ不整合の扱い

次のような症状でも、すぐに全リセットしません。

- ランキングだけ古い。
- サイネージだけ古い。
- 参加者画面のポイントとログ表示が違う。
- 事後ニュースが遅い。

時刻、UID、銘柄ID、イベントID、画面URL、正本/派生データを記録し、バックアップを取ってから担当者が修正方針を決めます。
Firestore Emulatorのデータを直接編集する場合も、同じイベントの他端末・履歴・ランキングへの影響を説明します。

## 11. データを失った疑いがある場合

- 追加の削除・リセット・再起動を止める。
- `data/firebase/`の現在状態をコピーし、時刻を付ける。
- Composeログと操作担当者を記録する。
- 直近バックアップとの差分を確認する。
- 復元先を分け、元データへ上書きする前にサンプル復元する。

「直せるかもしれない」コマンドを本番相当の運用データへ試さないことが最優先です。
