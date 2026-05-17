# NEWS Operations

## 日常点検

1. `npm test`
2. `npm run validate`
3. `npm run doctor`
4. `npm run dev:vercel`
5. ログイン後に以下を確認
   - 期間フィルタが効く
   - `新着` / `未読` / `すべて` が切り替わる
   - それぞれのビュー説明が表示される
   - `表示分を既読` 後に未読件数が減る
   - 保存 / 除外 / 再試行のフィードバックが表示される
   - 部分失敗の警告が出ても成功記事は残る
   - モバイル幅でサイドバーがドロワーになる
   - モバイル幅でタブや記事操作が横にはみ出さない

## 失敗時の見方

- `一部キーワードの取得に失敗しました`
  - Google News RSS の一時失敗を疑う
  - すぐ再試行せず、少し待ってから画面内の `再試行`
- `ニュースを取得できませんでした`
  - 全キーワード失敗
  - ネットワーク、認証、Google News 側を順に確認
- 本文抽出失敗
  - 記事元サイトのHTML構造依存
  - 元リンクは通常通り開ける

## 安全な運用

- `NEWS_APP_PASSWORD` と `NEWS_AUTH_SECRET` の両方を設定する
- `NEWS_AUTH_SECRET` はログイン用パスワードとは別のランダムな値にする
- Vercel の Production / Preview / Development は別環境なので、使う環境ごとに必要な値を入れる
- Vercel の env 変更は次の deployment から有効になる前提で確認する
- 外部RSSを監視用途で連打しない
- キーワード数を増やしすぎない
- 既存 localStorage を消す前にバックアップする
- Vercel 環境変数を画面共有やログへ出さない
- 本番公開前に `npm audit --omit=dev` を見る
- 本番デプロイは build / test 後だけにする

## ローカル認証設定

初回は `.env.example` から `.env` を作る:

```bash
cp .env.example .env
```

`.env` にはローカル専用の値を入れる:

```bash
NEWS_APP_PASSWORD=your-local-login-password
NEWS_AUTH_SECRET=your-random-local-session-secret
```

設定不足の確認だけなら `npm run doctor` を使う。`NEWS_AUTH_SECRET` が未設定の場合、アプリパスワードへはフォールバックせず API は `503` で止まる。

## Vercel env 確認

- Production: 本番公開に必須
- Preview: preview deployment を使う場合に必須
- Development: `vercel dev` で Vercel 側の値を使う運用なら確認
- `NEWS_AUTH_SECRET` は十分長いランダム値にし、`NEWS_APP_PASSWORD` と同じ値にしない
- 値そのものは issue / PR / チャット / 画面共有へ貼らない

## localStorage 復旧

1. バックアップを取る
2. 読書履歴だけ問題なら `ai-news-reading-state-v1` だけ削除
3. キーワードや除外設定まで壊れている場合のみ、対象キーを個別に戻す
4. 既存キーは移行時も残す。新しい機能は新しい versioned key へ足す

### バックアップから戻す例

```js
const backup = JSON.parse(prompt("backup json") ?? "{}");
for (const [key, value] of Object.entries(backup)) {
  localStorage.setItem(key, String(value));
}
```

戻す前に現在値も必ず退避する。

## 現在の保持方針

- 読書履歴: 120日 / 1200件
- Saved: 明示削除まで保持
- RSS: 1キーワード最大10件
- キーワード: 最大10件

## 将来の ops-center / service-monitor 連携案

まずは外部取得を増やさず、ブラウザ側または既存レスポンスから軽量 summary を作る:

```json
{
  "lastSuccessfulFetchAt": "ISO datetime",
  "activeKeywordCount": 8,
  "partialFailureKeywordCount": 1,
  "newCount": 4,
  "unreadCount": 12,
  "groupCount": 18,
  "groupedArticleCount": 7,
  "periodExcludedCount": 5,
  "sourceExcludedCount": 2,
  "wordExcludedCount": 1
}
```

候補:

- UI内で summary を生成して export
- 将来 DB / KV を入れた時だけ、認証済みの軽量 summary endpoint を追加
- ops-center 側は状態の読み取りだけにし、RSS再取得を起こさない

## 次回変更時のチェックリスト

- グループIDが不用意に変わって既読履歴を失わないか
- 日時不明記事が期間フィルタをすり抜けないか
- partial failure で成功記事が消えないか
- 新しい localStorage schema が古い値を読めるか
- モバイルで reading toolbar が押しにくくないか
- テストが純粋関数の境界を守っているか
