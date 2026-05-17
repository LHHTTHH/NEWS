import type { ReadingView } from "./news";

export function getReadingViewDescription(
  view: ReadingView,
  previousSessionAt: string | null
): string {
  if (view === "new") {
    return previousSessionAt
      ? "前回閲覧後に初めて見えた記事です。"
      : "初回表示では、まだ読んでいない記事を新着として扱います。";
  }

  if (view === "unread") {
    return "まだ既読にしていない記事です。";
  }

  return "現在の期間・キーワード・除外条件に合う記事です。";
}

export function isAuthConfigurationError(error: string | null): boolean {
  return Boolean(
    error &&
      error.includes("NEWS_APP_PASSWORD") &&
      error.includes("NEWS_AUTH_SECRET")
  );
}
