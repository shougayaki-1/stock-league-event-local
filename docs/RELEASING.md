# OSS公開・リリース確認

## 初回公開前

1. GitHub上で空のリポジトリを作成し、`main` を既定ブランチにします。
2. GitHubの **Private Vulnerability Reporting** を有効化します。
3. 質問の受け皿にする場合は GitHub Discussions を有効化します。
4. `main` に対するブランチ保護（プルリクエスト必須・CI必須）を設定します。
5. Issueテンプレートのセキュリティ連絡先を、Private Vulnerability Reportingへの実URLに設定します。
6. `LICENSE`、`SECURITY.md`、`THIRD_PARTY_NOTICES.md` を配布形態に照らして確認します。特に
   `ffmpeg-static` を含むDockerイメージの配布はGPL条件を確認してください。

## リリース前チェック

```sh
git status --ignored
docker compose config -q
docker compose build
npm run test
```

- `.env`、`data/`、Firebase Emulatorのエクスポート、実在する参加者情報・動画が追跡対象でないことを確認します。
- `.env.example` に実運用のメールアドレスやパスワードが入っていないことを確認します。
- `npm audit` と依存関係スキャナーの結果を確認し、必要に応じて更新します。
- Docker Desktopを入れた別PCで、READMEの手順だけで起動・ログイン・バックアップ復元を確認します。

## 公開後

GitHub Releasesでバージョンタグと変更内容を公開します。継続的な依存関係更新には
`.github/dependabot.yml` を有効にし、CIの失敗を確認してからマージしてください。
