# AI context entry point

AIエージェントは、まず [AGENTS.md](AGENTS.md) と [docs/ai/README.md](docs/ai/README.md) を読んでください。
詳細なコンテキストは `docs/ai/` にあり、MCP対応クライアントからは次で読み取り専用サーバーとして公開できます。

```sh
npm run ai:mcp
```

このサーバーは説明資料と定型プロンプトのみを返します。Firebase、Docker、Firestore Emulator、参加者データを変更する機能はありません。
