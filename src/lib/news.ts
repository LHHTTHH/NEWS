import type { NewsGroup } from "../types";

export type PeriodFilter = "24h" | "3d" | "7d";
export type ReadingView = "new" | "unread" | "all";

export const PERIOD_FILTER_OPTIONS: Array<{
  value: PeriodFilter;
  label: string;
  days: number;
}> = [
  { value: "24h", label: "24時間以内", days: 1 },
  { value: "3d", label: "3日以内", days: 3 },
  { value: "7d", label: "7日以内", days: 7 }
];

const FUTURE_ARTICLE_TOLERANCE_MS = 15 * 60 * 1000;

export function isPeriodFilter(value: string): value is PeriodFilter {
  return PERIOD_FILTER_OPTIONS.some((option) => option.value === value);
}

export function isArticleInPeriod(
  publishedAt: string,
  periodFilter: PeriodFilter,
  now = Date.now()
): boolean {
  const publishedAtTime = getPublishedAtTime(publishedAt);
  if (publishedAtTime === null || publishedAtTime > now + FUTURE_ARTICLE_TOLERANCE_MS) {
    return false;
  }

  const selectedOption = PERIOD_FILTER_OPTIONS.find(
    (option) => option.value === periodFilter
  );
  if (!selectedOption) {
    return true;
  }

  const cutoffTime = now - selectedOption.days * 24 * 60 * 60 * 1000;
  return publishedAtTime > cutoffTime;
}

export function getPublishedAtTime(publishedAt: string): number | null {
  const publishedAtTime = new Date(publishedAt).getTime();
  return Number.isNaN(publishedAtTime) ? null : publishedAtTime;
}

export function normalizeSourceName(sourceName: string): string {
  return sourceName.normalize("NFKC").trim().toLowerCase();
}

export function matchesExcludedWords(
  article: Pick<NewsGroup, "title" | "summary">,
  excludedWords: string[]
): boolean {
  if (excludedWords.length === 0) {
    return false;
  }

  const haystack = `${article.title} ${article.summary}`.normalize("NFKC").toLowerCase();
  return excludedWords.some((word) => {
    const normalizedWord = word.normalize("NFKC").trim().toLowerCase();
    return normalizedWord.length > 0 && haystack.includes(normalizedWord);
  });
}

export function filterNewsArticles(
  articles: NewsGroup[],
  {
    excludedSources,
    excludedWords,
    periodFilter,
    now
  }: {
    excludedSources: string[];
    excludedWords: string[];
    periodFilter: PeriodFilter;
    now?: number;
  }
): {
  periodFilteredArticles: NewsGroup[];
  sourceFilteredArticles: NewsGroup[];
  visibleArticles: NewsGroup[];
  periodExcludedCount: number;
  sourceExcludedCount: number;
  wordExcludedCount: number;
} {
  const periodFilteredArticles = articles.filter((article) =>
    isArticleInPeriod(article.publishedAt, periodFilter, now)
  );
  const normalizedExcludedSources = new Set(
    excludedSources.map(normalizeSourceName).filter(Boolean)
  );
  const sourceFilteredArticles = periodFilteredArticles.filter(
    (article) => !normalizedExcludedSources.has(normalizeSourceName(article.sourceName))
  );
  const visibleArticles = sourceFilteredArticles.filter(
    (article) => !matchesExcludedWords(article, excludedWords)
  );

  return {
    periodFilteredArticles,
    sourceFilteredArticles,
    visibleArticles,
    periodExcludedCount: articles.length - periodFilteredArticles.length,
    sourceExcludedCount:
      periodFilteredArticles.length - sourceFilteredArticles.length,
    wordExcludedCount: sourceFilteredArticles.length - visibleArticles.length
  };
}

export function buildPartialFailureMessage(failedKeywords?: string[]): string | null {
  if (!failedKeywords || failedKeywords.length === 0) {
    return null;
  }

  return `一部キーワードの取得に失敗しました: ${failedKeywords.join(", ")}`;
}
