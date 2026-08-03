# Stock League Event Local

株式学習イベント向けシステムの、動画配信・サイネージ・取引・ランキングを含むフル機能ローカル版です。
WebアプリとバックエンドをDocker Composeで起動し、イベント中のデータはすべて運営PC内に保存します。

Firebaseの本番サービスは使用しません。Authentication / Firestore / Functions / Storage / Pub/Subは
Firebase Emulator Suiteで動作し、Webクライアントも常にローカルエミュレータへ接続します。

## 必要なもの

- Docker Desktop、またはDocker Engine + Docker Compose v2
- 初回ビルド時のインターネット接続
- 空きディスク4GB以上、メモリ4GB以上を推奨

Firebase Emulator、MediaPipe WASM、手認識モデルはイメージへ取り込みます。イメージの作成後は、
起動・停止・通常運用をインターネット接続なしで行えます。

## 起動

```sh
cp .env.example .env
# .env の LOCAL_ADMIN_EMAIL / LOCAL_ADMIN_PASSWORD を実運用の値へ変更する
docker compose up --build -d
```

起動前に、`.env` の初期管理者情報を必ず変更してください。パスワードは16文字以上の一意な値が必要です。

```dotenv
LOCAL_ADMIN_EMAIL=admin@example.local
LOCAL_ADMIN_PASSWORD=16文字以上の一意なパスワード
```

起動後のアクセス先:

| 用途 | URL |
|---|---|
| アプリ | http://localhost:8098 |
| 参加者ログイン | http://localhost:8098/login |
| 管理者ログイン | http://localhost:8098/admin/login |
| Firebase Emulator UI | http://localhost:4000 |

初回は管理者ログイン後に「ユーザー管理」から参加者IDを作成し、参加者端末では
`/login` を開いてIDまたはQRコードでログインします。

## 停止・再起動・バックアップ

データを書き出して停止するには次を実行します。

```sh
docker compose stop
```

再起動:

```sh
docker compose up -d
```

Authentication / Firestore / Storageのデータは `data/firebase/` に保存され、次回起動時に
自動で読み込まれます。バックアップは停止後に `data/firebase/` を丸ごとコピーしてください。
コンテナとイメージを削除しても、このディレクトリを残せばイベントデータを復元できます。

## 同一LANから利用する

運営PCのIPアドレスが `192.168.1.20` なら、参加端末から次のURLを開きます。

```text
http://192.168.1.20:8098
```

ブラウザは表示中ページと同じホスト上のエミュレータへ接続します。運営PCのファイアウォールでは、
8098 / 5001 / 8080 / 9099 / 9199番ポートを信頼できるLAN内から到達可能にしてください。

カメラを使うジェスチャー端末はブラウザのSecure Context制約を受けます。運営PC自身の
`localhost` では利用できますが、LAN上の別端末からHTTPで開くとカメラが拒否される場合があります。
その場合は、LAN内で信頼できるHTTPSリバースプロキシを用意してください。

## コンテナ構成

- `web`: React/ViteアプリをNginxで配信
- `firebase`: Auth / Firestore / Functions / Storage / Pub/Sub Emulator
- `bootstrap`: 初期管理者と最低限のシステム設定を冪等に作成
- `runner`: Cloud Scheduler / Cloud Tasksの代わりに定期処理と価格workerをローカル実行

既定のFirebaseプロジェクトIDは `demo-stock-league-event-local` です。`demo-` プロジェクトを使い、
未エミュレートの本番サービスへ誤って接続しない構成にしています。

## 状態確認

```sh
docker compose ps
docker compose logs -f firebase runner web
```

正常時は `firebase` と `web` が `healthy`、`runner` が `Up`、`bootstrap` が `Exited (0)` です。
`bootstrap` は初期化完了後に終了する設計です。

## ポート変更

`.env` で変更できます。公開ポートはWebアプリのビルド時にも埋め込まれるため、変更後は再ビルドします。

```sh
docker compose build web
docker compose up -d
```

## 開発

アプリとFunctionsのソースは、それぞれ `src/` と `functions/src/` にあります。Docker構成は
`compose.yaml` と `docker/` に集約しています。ローカル専用版のため、Firebaseへのdeploy用スクリプトや
本番プロジェクト設定は含めていません。

## AIから操作・開発する場合

このリポジトリには、AIがアプリの概念・全画面・Firestoreデータ・運用手順・障害対応を理解するための
[AI context pack](docs/ai/README.md) を同梱しています。コーディングエージェントはまず
[AGENTS.md](AGENTS.md) と `docs/ai/` を読みます。

MCP対応クライアントから読み取り専用のコンテキストサーバーを使う場合:

```sh
npm run ai:mcp
```

サーバーは説明資料と定型プロンプトだけを返し、Firebase・Docker・イベントデータを変更するToolは提供しません。
接続例は [docs/ai/mcp.md](docs/ai/mcp.md) を参照してください。

## セキュリティ

この構成は、信頼できる運営PCと信頼できるLANだけで使うことを前提にしています。公開インターネットへ
ポートを転送・公開しないでください。特に `.env`、`data/`、Firebase Emulatorのエクスポートには、
管理者認証情報やイベント参加者データが含まれ得るため、Gitへ追加・共有してはいけません。

脆弱性の報告は [SECURITY.md](SECURITY.md) を参照してください。

## OSSへの参加

バグ報告、提案、プルリクエストを歓迎します。手順は [CONTRIBUTING.md](CONTRIBUTING.md)、利用方法の質問は
[SUPPORT.md](SUPPORT.md) を参照してください。配布物に含まれる動画最適化コンポーネントのライセンス上の注意は
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に記載しています。公開前のリリース確認は
[docs/RELEASING.md](docs/RELEASING.md) を使用してください。

## ライセンス

このリポジトリのソースコードは [MIT License](LICENSE) で提供します。Dockerイメージに含まれる
第三者コンポーネントについては、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) も確認してください。
