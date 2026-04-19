# 実装メモ

## 今回入れた範囲

- React + TypeScript + Vite の最小SPAを新規作成
- `/api/news` の Vercel Function を追加
- Google News RSS をキーワード単位で取得して一覧表示
- 「後で読む」を `localStorage` に保存
- 重複統合は初版の簡易版で実装

## 今の重複統合ルール

- タイトル完全一致
- 記号除去 + 空白正規化 + 小文字化後の一致

近似判定は未実装です。

## 未検証

- 実ブラウザでの表示確認、Google News RSS の実データ確認は未実施

## 今回のセットアップ結果

- `.tools/node-v24.15.0-darwin-x64` にローカル Node.js を展開
- その Node を使って `npm install` を実行
- `npm run build` は成功
- `npx vercel --version` は成功

## 補足

- `npm install` 後に `package-lock.json` を生成
- `npm audit` 相当では moderate severity が 2 件表示されたが、今回は未対応

## あとで見たいポイント

- Google News RSS の `description` は媒体によってノイズが残る可能性あり
- Google News のリンクは誘導URLのまま使用している
- 近似タイトルの重複統合は次段階で追加可能
- 必要なら保存済み一覧にも媒体名、公開日時、関連件数を追加できる
