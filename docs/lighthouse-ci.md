# Lighthouse CI 運用ガイド

## 概要

`.github/workflows/lighthouse.yml` で PR / push to main 時に Lighthouse CI を
実行し、performance regression を早期検出する。

## 計測対象

| URL | 計測ページ |
|---|---|
| `/browse` | 戦略一覧 |
| `/detail/sma_cross` | バックテスト詳細 |
| `/compare?ids=...` | 戦略比較 |
| `/ideas` | アイデア一覧 |

E2E fixture (`frontend/e2e/fixtures/forge/`) を使ってフィクスチャ DB で計測する。

## 警告閾値（lighthouserc.json）

| 指標 | 閾値 | レベル |
|---|---|---|
| Performance スコア | >= 85% | warn |
| Accessibility スコア | >= 90% | warn |
| Best Practices スコア | >= 90% | warn |
| First Contentful Paint (FCP) | < 1700 ms | warn |
| Largest Contentful Paint (LCP) | < 2500 ms | warn |
| Total Blocking Time (TBT) | < 300 ms | warn |
| Cumulative Layout Shift (CLS) | < 0.15 | warn |

すべて `warn` レベル: 違反しても CI は通るが警告ログに出る。安定したら個別に
`error` 昇格を検討する。

## レポートの確認方法

### Artifact

ジョブ完了後、Actions ページの artifact `lighthouse-reports` をダウンロード
すると HTML レポートが取得できる。

### temporary-public-storage

`lighthouserc.json` の `upload.target` で `temporary-public-storage` に設定。
ジョブログに公開 URL が出力される（数日で削除される）。

## GitHub App 連携で PR コメント表示（任意）

Lighthouse CI 公式 GitHub App を導入すると、PR にスコア表が直接コメント
される。

### セットアップ手順

1. <https://github.com/apps/lighthouse-ci> をブラウザで開く
2. **Configure** → 対象リポジトリ (`alforge-labs/alpha-visualizer`) を選択
3. インストール後に表示される token をコピー
4. リポジトリの **Settings → Secrets and variables → Actions** で
   `LHCI_GITHUB_APP_TOKEN` という名前で Secret 登録
5. ワークフローは `${{ secrets.LHCI_GITHUB_APP_TOKEN || '' }}` を環境変数で
   参照済みなので、追加の YAML 変更は不要

token 未登録時は `temporary-public-storage` にフォールバックする。

## 閾値調整の方針

数 PR 経過してスコアの実態が見えたら、徐々に厳しくする:

1. warn のまま維持 → 違反頻度を観察
2. 安定して通っている指標は **`error`** に昇格
3. Performance 90 / FCP 1500ms / LCP 2200ms / TBT 200ms が長期目標

CLS が境界に近い場合は、まずレイアウトジャンクの原因（フォント読み込み・
動的 chart 高さ・画像 placeholder の有無）を調査する。

## トラブルシューティング

### `chrome-launcher: Unable to find a Chrome` エラー

CI 環境に Chrome が無い → `chromeFlags: "--no-sandbox --headless=new --disable-gpu"`
で headless 起動を強制している。それでもダメなら `setup-chrome` action を
追加する。

### artifact が空

`lighthouserc.json` の `upload.target` が `temporary-public-storage` 以外を
指していて upload が失敗している可能性。`.lighthouseci/` の存在を確認。

## 関連

- ワークフロー: `.github/workflows/lighthouse.yml`
- 設定: `lighthouserc.json`
- 元 PR: PR #136
