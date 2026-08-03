# AI context MCP server

## 目的

`tools/ai-context-server.mjs` は、公式MCP SDKへ依存しない小さな読み取り専用stdioサーバーです。
MCPのResourcesで資料を、PromptsでAIへの定型依頼を提供します。イベントの状態を読むToolsや、Firestore/Dockerを変更するToolsは意図的にありません。

## 起動

```sh
npm install
npm run ai:mcp
```

stdio対応クライアントでは、実行コマンドを次のように設定します。

```json
{
  "mcpServers": {
    "stock-league-event-local-context": {
      "command": "npm",
      "args": ["run", "ai:mcp"],
      "cwd": "/absolute/path/to/stock-league-event-local"
    }
  }
}
```

クライアントによって設定ファイルの場所・キー名は異なるため、上記は概念例です。`cwd`は実際のリポジトリ絶対パスへ置き換えます。

## Resources

`resources/list` は次のURIを返します。

| URI | 内容 | 書き込み |
|---|---|---|
| `stock-league://ai/README` | パックの読み方、AI境界 | なし |
| `stock-league://ai/concepts` | 用語、不変条件、アーキテクチャ | なし |
| `stock-league://ai/screens` | 全ルートと画面操作 | なし |
| `stock-league://ai/operations` | イベント運用 | なし |
| `stock-league://ai/data-model` | Firestoreデータ | なし |
| `stock-league://ai/troubleshooting` | 診断・復旧 | なし |
| `stock-league://ai/prompts` | 定型プロンプト | なし |
| `stock-league://ai/manifest` | JSONの機械可読一覧 | なし |
| `stock-league://ai/mcp` | このサーバーの説明 | なし |

サーバーは既知URI以外を読みません。パスをユーザー入力から組み立てないため、`../.env`のようなパストラバーサルも拒否されます。

## Prompts

- `orient(goal)`: 目的に関係する役割・画面・データ・リスクを要約する。
- `operate-event(phase)`: prepare/run/incident/closeの運用チェックリストを作る。
- `review-change(change)`: コード変更を権限・不変条件・ローカル制約・検証でレビューする。
- `troubleshoot(symptom)`: 症状を観測可能な証拠から切り分ける。

Promptはユーザーの明示的な選択を前提にしたテンプレートです。AIが勝手にイベント操作を起動するものではありません。

## JSON-RPCの扱い

1行1JSONのstdioメッセージを読み、1行1JSONで応答します。対応メソッドは以下です。

| Method | 用途 |
|---|---|
| `initialize` | プロトコル・capability・サーバー情報 |
| `notifications/initialized` | 初期化通知（応答なし） |
| `ping` | 接続確認 |
| `resources/list` | リソース一覧 |
| `resources/read` | URIの本文取得 |
| `prompts/list` | プロンプト一覧 |
| `prompts/get` | 引数を埋めたプロンプト取得 |
| `tools/list` | 空のTool一覧 |

依存ライブラリがないため、JSON-RPC実装の互換性は接続先クライアントで確認してください。将来公式SDKへ移行する場合も、
読み取り専用・秘密情報除外・Tools空配列という安全方針を維持します。

## 直接テスト

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | npm run ai:mcp
printf '%s\n' '{"jsonrpc":"2.0","id":2,"method":"resources/list"}' | npm run ai:mcp
```

出力へ`.env`、`data/`、Authトークン、個人情報が混ざっていないことも確認します。
