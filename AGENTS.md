# AI / coding-agent entry point

このファイルは、Stock League Event LocalをAIエージェントが扱うときの最初の案内です。コードを変更する前に、
必ず [docs/ai/README.md](docs/ai/README.md) と [docs/ai/manifest.json](docs/ai/manifest.json) を読み、
必要に応じて同ディレクトリ内のリソースを参照してください。

## このリポジトリの意味

これは学校祭・授業・イベントを運営するための完全ローカル版です。本番Firebase、SaaS API、外部認証を
使う前提ではありません。Docker Composeが起動するFirebase Emulator Suiteが唯一のバックエンドです。
`data/` は運営データ、`.env` は秘密設定なので、読み取って回答へ出力したり、Gitへ追加したりしないでください。

## AIが守ること

1. 画面やデータの意味を推測だけで変更せず、AIコンテキストパックと実装を照合する。
2. 参加者、運営端末、一般管理者、コア管理者、サイネージ端末の権限境界を維持する。
3. 取引、全員確定、全リセット、管理者削除、データ削除、緊急相場操作は副作用のある操作として扱い、
   実行前に対象・影響・復元方法を人間へ確認する。
4. 取引の約定価格・残高・取引履歴をクライアントだけで計算して確定しない。取引はCallable Functionの
   サーバー処理と冪等キーを経由する。
5. サイネージはログイン不要で長時間稼働するため、認証を追加する変更や自動リロードを安易に行わない。
6. 金曜午前セッションを自動検索・復元する機能は削除済みであり、復活させない。
7. 変更後は、可能なら `docker compose config -q`、`docker compose build`、関連テストを実行する。

## AIコンテキストパックの使い方

`tools/ai-context-server.mjs` は、このリポジトリの安全な説明資料だけを読み出す、読み取り専用の
MCP互換stdioサーバーです。外部サービス、Firestore、Docker、ファイル書き込みを実行しません。

```sh
npm run ai:mcp
```

対応するリソース・プロンプト・JSON-RPCの概要は [docs/ai/mcp.md](docs/ai/mcp.md) にあります。
