# Third-party notices

このリポジトリのソースコードは [MIT License](LICENSE) で提供します。ただし、Dockerイメージと
依存関係には別ライセンスの第三者コンポーネントが含まれます。

## FFmpeg / ffmpeg-static

`functions/package.json` は動画最適化のために `ffmpeg-static` を使用します。現在ロックされている
`ffmpeg-static` 5.3.0 は `GPL-3.0-or-later` と表示されています（`functions/package-lock.json`）。
そのため、この依存関係を含むDockerイメージを配布する場合は、FFmpegおよびその配布物に適用される
ライセンス、通知、ソース提供義務を確認し、遵守してください。

これは法的助言ではありません。許諾条件が用途に合うかは、配布者の責任で確認してください。
動画最適化を不要とする配布では、`ffmpeg-static` とそれを使う機能を除外する選択肢があります。
