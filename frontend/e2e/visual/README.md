# TV チャートのビジュアル回帰テスト（issue #319）

lightweight-charts は Canvas 描画のため、DOM ベースの E2E ではマーカーや priceLine、
レジーム背景バンドの描画退行を検出できない。ここでは `toHaveScreenshot()` で
コミット済みベースラインと突き合わせる。

`e2e/screenshots/` は**ドキュメント用の画像生成**であり比較を伴わない。役割が違うので混同しないこと。

## 実行

```bash
cd frontend
pnpm run build          # 静的アセットを最新にしてから
pnpm run test:visual
```

## ベースラインは linux 版だけをコミットする

Playwright のスナップショットは OS ごとにディレクトリが分かれる
（`__snapshots__/linux/` / `__snapshots__/darwin/`）。フォントのラスタライズが
OS で異なるため、macOS で撮った画像は CI（ubuntu）では使えない。

そのため **linux 版のみをコミットし、CI の `visual-regression` ジョブを唯一の正**とする。
macOS でのローカル実行は `__snapshots__/darwin/` を自動生成するが、これは
gitignore 済みで、初回は「ベースラインが無い」ため必ず 1 度失敗する（2 回目以降は比較が走る）。
ローカルの darwin ベースラインは「自分の変更前後で見た目が変わっていないか」を
手元で見るための使い捨てと考えること。

## 見た目を意図的に変えたときのベースライン更新手順

1. 変更を push して CI を回す。`visual-regression` が差分で落ちる
2. 失敗した run の **`visual-snapshots` アーティファクト**をダウンロードする
   ```bash
   gh run download <run-id> --repo alforge-labs/alpha-visualizer --name visual-snapshots
   ```
3. 中の `e2e/visual/__snapshots__/linux/*.png` をリポジトリの同じパスへ上書きコピーし、
   **画像を目視で確認してから**コミットする（差分画像は `test-results/` に入っている）
4. push すると `visual-regression` が green になる

初めてベースラインを作るときも同じ手順（1 回目は「ベースラインが無い」ため失敗し、
そのとき生成された実画像がアーティファクトに入る）。

## 偽陽性を避けるための設定

- `maxDiffPixelRatio: 0.02` — ランナーイメージ更新に伴うフォントのアンチエイリアス差で
  落ちないよう、わずかな差は許容する。厳密一致は取らない
  （alpha-forge のゴールデンテストで ARM↔x86 の 1 ULP 差によるバーシフトを踏んだ経験から、
  Canvas 比較でも厳密一致は避ける方針）
- `viewport` / `deviceScaleFactor` / `locale` / `timezoneId` / `colorScheme` を config で固定
- チャート要素だけを撮る（ページ全体を撮ると無関係な UI 変更で落ちる）

## 決定性チェック

`tv-charts.spec.ts` の最後にある「同一データを 2 回描画してもピクセルが一致する」は
ベースラインを持たない。環境差の影響を受けずに「描画自体が非決定的になっていないか」
だけを見るため、ベースライン未整備の状態でも動く。
