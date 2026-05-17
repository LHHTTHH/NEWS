# AIニュース収集アプリ

Google News RSS を Vercel Functions 経由で取得し、毎日読む AI ニュースを短時間で確認するための個人用アプリです。
React + TypeScript + Vite のフロントエンドと、RSS / 本文取得を仲介する API で構成されています。

## 目的

- 同じ話題を何度も読まない
- 24時間 / 3日 / 7日で古い記事を自然に落とす
- 朝に読んだあと、夕方は新着と未読から再開する
- モバイルでも長い一覧を何度も上から読み直さない
- キーワードや除外条件を壊さず、長く運用する

## 主な機能

- 複数キーワードの登録と ON / OFF
- Google News RSS の取得
- 類似記事グルーピング
  - Unicode 正規化、記号除去、媒体名や速報ノイズの除去
  - 近いタイトルと要約 fingerprint を使った保守的な統合
  - 関連記事数と related coverage の表示
- 期間フィルタ
  - `24時間以内`
  - `3日以内`
  - `7日以内`
  - 日時不明 / 不正な未来日時は期間表示から除外
- 未読 / 既読管理
  - `新着`, `未読`, `すべて` の切り替え
  - 各ビューの意味を画面内で常時表示
  - 記事単位の既読 / 未読切り替え
  - 表示中の未読記事だけをまとめて既読
  - 最初の未読へジャンプ
- 新着導線
  - 前回閲覧時刻を保存
  - 前回閲覧後に初めて見えた記事を `新着` として表示
- フィルタ
  - 除外ワード
  - 除外ソース
- 保存
  - `保存済み` タブに後で読む記事を保存
  - 保存 / 除外 / 一括既読の操作結果を画面内で通知
- 本文表示
  - カード内で必要時のみ本文を遅延取得
- モバイルUI
  - サイドバーはドロワー
  - 読書ツールバーは縦積みに変化
  - タブ、記事操作、状態表示は狭い幅でも折り返して操作可能

## 日常利用

### 朝

1. `未読` を開く
2. 気になる記事は `本文` / `元記事` で読み、不要なら `既読`
3. 似た話題は `関連記事` で束ねて確認
4. 一通り見たら `表示分を既読`

### 夕方

1. `新着` を開く
2. 朝以降に初めて見えた記事だけを先に読む
3. 未処理が残っていれば `未読` に戻る
4. 長くなったら `未読へ` で続きから再開

`新着` は published date だけでなく、ブラウザがその記事を初めて見た時刻で判定します。RSS の公開日時が怪しい記事が混ざっても、朝夕の差分を見つけやすくするためです。

## 重複排除と古い記事

- 取得した記事は、完全一致だけでなくタイトルの正規化後一致や類似度でグループ化します
- グループIDは代表記事ではなく、グループ内の正規化タイトルから決まる安定寄りのIDを使います
- 代表記事はグループ内で最も新しい記事です
- RSS の `pubDate` がない / 壊れている記事は日時不明として扱い、期間フィルタでは表示しません
- 遠い未来日時も表示しません

過剰統合を避けるため、意味が近そうというだけではまとめず、タイトル overlap と要約 overlap の両方を使う保守的な判定にしています。

## キーワードと除外条件

- 空キーワードや重複キーワードは受け付けません
- API 側でも大文字小文字違いの重複をまとめ、最大10キーワードまでに制限します
- 除外ワードは大文字小文字と全角半角を正規化して判定します
- 除外ソースはサイドバーで戻せます

## RSS 取得失敗時

- 1キーワードだけ失敗した場合、成功したキーワードの記事は残し、警告だけ表示します
- 全キーワードが失敗した場合はエラー表示になります
- エラー / 部分失敗の表示から、その場で再試行できます
- 外部RSSへの取得本数は増やさず、1キーワードあたり最大10件のままです
- 本文取得は記事を開いた時だけ実行します

## localStorage

保存キー:

- `ai-news-keywords`
- `ai-news-keyword-enabled-map`
- `ai-news-excluded-words`
- `ai-news-excluded-sources`
- `ai-news-period-filter`
- `ai-news-saved-articles`
- `ai-news-reading-state-v1`
  - `firstSeenAt`
  - `lastSeenAt`
  - `readAt`
  - `lastOpenedAt`
  - `lastReadAt`

`reading-state-v1` は既存キーを変更せず追加した新しい保存領域です。壊れたJSONや不正レコードは読み込み時に捨てますが、既存のキーワードや保存記事は勝手に初期化しません。既読履歴は最大1200件、最終確認から120日で自然に整理します。

### バックアップ

ブラウザの DevTools Console で:

```js
copy(JSON.stringify(Object.fromEntries(Object.entries(localStorage)), null, 2))
```

### 読書状態だけリセット

```js
localStorage.removeItem("ai-news-reading-state-v1")
```

### 全設定を戻す前に

キーワードや除外条件も消えるため、全消去はバックアップ後だけにしてください。

## ローカル起動

初回だけ `.env.example` を元に `.env` を作り、ローカル専用の値を設定します。
`NEWS_AUTH_SECRET` はログイン用パスワードとは別のランダムな文字列にしてください。

```bash
cp .env.example .env
```

`.env`:

```bash
NEWS_APP_PASSWORD=your-local-login-password
NEWS_AUTH_SECRET=your-random-local-session-secret
```

`.env` は Git 管理しません。ローカルでも `NEWS_APP_PASSWORD` と `NEWS_AUTH_SECRET` の両方が必要です。

フロントだけ:

```bash
npm install
npm run dev
```

API込み:

```bash
npm run dev:vercel
```

通常の起動先:

- Vite: `http://localhost:5173`
- Vercel dev: `http://localhost:3000`

## テストとビルド

```bash
npm test
npm run validate
npm run build
```

`build` は TypeScript check を含みます。環境確認だけしたい場合は `npm run doctor` も使えます。

## 外部公開時の認証

必須:

- `NEWS_APP_PASSWORD`
- `NEWS_AUTH_SECRET`

設定例:

```bash
npx vercel env add NEWS_APP_PASSWORD production
npx vercel env add NEWS_AUTH_SECRET production
```

`NEWS_APP_PASSWORD` はログイン入力と照合する値、`NEWS_AUTH_SECRET` は認証Cookieの署名にだけ使う独立secretです。
`NEWS_AUTH_SECRET` が未設定でも `NEWS_APP_PASSWORD` へフォールバックしません。
認証が未設定なら API は `503`、未ログインなら `401` を返します。ログインCookieは `HttpOnly`, `SameSite=Lax`, 本番では `Secure` です。

Vercel で Preview deployment を使う場合は、Preview 環境にも同じ2変数を設定してください。Production / Preview / Development は別環境として扱われ、環境変数の変更は新しい deployment にだけ反映されます。

ローカルで `.env` を使う場合は Git に入れず、owner-only 権限で保持してください。

## デプロイ

```bash
npm run build
npx vercel deploy --prod
```

本番デプロイは人が明示的に実行してください。日常開発では `npm run dev:vercel` と `npm test` / `npm run build` で十分です。

## 将来の改善候補

- 設定の export / import UI
- ログイン試行の rate limit
- 端末間同期
- 要約品質の改善
- group collapse の永続化
- 監視用 summary endpoint

運用手順と将来の `ops-center` 連携案は [docs/OPERATIONS.md](./docs/OPERATIONS.md) にまとめています。
