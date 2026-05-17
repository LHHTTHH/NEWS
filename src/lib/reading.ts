import type { NewsGroup } from "../types";
import type { ReadingView } from "./news";

export type ArticleReadingRecord = {
  firstSeenAt: string;
  lastSeenAt: string;
  readAt?: string;
};

export type ReadingState = {
  version: 1;
  lastOpenedAt: string | null;
  lastReadAt: string | null;
  articles: Record<string, ArticleReadingRecord>;
};

const READING_STATE_VERSION = 1;
const READING_STATE_MAX_RECORDS = 1200;
const READING_STATE_RETENTION_DAYS = 120;

export function createEmptyReadingState(): ReadingState {
  return {
    version: READING_STATE_VERSION,
    lastOpenedAt: null,
    lastReadAt: null,
    articles: {}
  };
}

export function normalizeReadingState(value: unknown): ReadingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyReadingState();
  }

  const candidate = value as Partial<ReadingState>;
  const articles =
    candidate.articles && typeof candidate.articles === "object"
      ? Object.fromEntries(
          Object.entries(candidate.articles).filter(
            (entry): entry is [string, ArticleReadingRecord] =>
              Boolean(entry[0]) && isArticleReadingRecord(entry[1])
          )
        )
      : {};

  return {
    version: READING_STATE_VERSION,
    lastOpenedAt: normalizeOptionalIsoDate(candidate.lastOpenedAt),
    lastReadAt: normalizeOptionalIsoDate(candidate.lastReadAt),
    articles
  };
}

export function markSessionOpened(
  state: ReadingState,
  openedAt = new Date().toISOString()
): ReadingState {
  return {
    ...state,
    lastOpenedAt: openedAt
  };
}

export function mergeSeenArticles(
  state: ReadingState,
  articles: Array<Pick<NewsGroup, "id">>,
  seenAt = new Date().toISOString()
): ReadingState {
  const nextArticles = { ...state.articles };

  for (const article of articles) {
    const current = nextArticles[article.id];
    nextArticles[article.id] = current
      ? {
          ...current,
          lastSeenAt: seenAt
        }
      : {
          firstSeenAt: seenAt,
          lastSeenAt: seenAt
        };
  }

  return pruneReadingState({
    ...state,
    articles: nextArticles
  });
}

export function markArticlesRead(
  state: ReadingState,
  articleIds: string[],
  readAt = new Date().toISOString()
): ReadingState {
  if (articleIds.length === 0) {
    return state;
  }

  const nextArticles = { ...state.articles };

  for (const articleId of articleIds) {
    const current = nextArticles[articleId];
    nextArticles[articleId] = {
      firstSeenAt: current?.firstSeenAt ?? readAt,
      lastSeenAt: current?.lastSeenAt ?? readAt,
      readAt
    };
  }

  return {
    ...state,
    lastReadAt: readAt,
    articles: nextArticles
  };
}

export function markArticleUnread(state: ReadingState, articleId: string): ReadingState {
  const current = state.articles[articleId];
  if (!current?.readAt) {
    return state;
  }

  const { readAt: _readAt, ...nextRecord } = current;
  return {
    ...state,
    articles: {
      ...state.articles,
      [articleId]: nextRecord
    }
  };
}

export function isArticleRead(state: ReadingState, articleId: string): boolean {
  return Boolean(state.articles[articleId]?.readAt);
}

export function isArticleNewSince(
  state: ReadingState,
  articleId: string,
  previousSessionAt: string | null
): boolean {
  const firstSeenAt = state.articles[articleId]?.firstSeenAt;
  if (!firstSeenAt) {
    return true;
  }

  if (!previousSessionAt) {
    return !isArticleRead(state, articleId);
  }

  return new Date(firstSeenAt).getTime() > new Date(previousSessionAt).getTime();
}

export function filterArticlesByReadingView(
  articles: NewsGroup[],
  state: ReadingState,
  view: ReadingView,
  previousSessionAt: string | null
): NewsGroup[] {
  if (view === "all") {
    return articles;
  }

  if (view === "new") {
    return articles.filter((article) =>
      isArticleNewSince(state, article.id, previousSessionAt)
    );
  }

  return articles.filter((article) => !isArticleRead(state, article.id));
}

export function getReadingCounts(
  articles: NewsGroup[],
  state: ReadingState,
  previousSessionAt: string | null
): { newCount: number; unreadCount: number; readCount: number } {
  let newCount = 0;
  let unreadCount = 0;

  for (const article of articles) {
    if (!isArticleRead(state, article.id)) {
      unreadCount += 1;
    }

    if (isArticleNewSince(state, article.id, previousSessionAt)) {
      newCount += 1;
    }
  }

  return {
    newCount,
    unreadCount,
    readCount: articles.length - unreadCount
  };
}

export function pruneReadingState(
  state: ReadingState,
  now = Date.now()
): ReadingState {
  const retentionCutoff =
    now - READING_STATE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const records = Object.entries(state.articles)
    .filter(([, record]) => {
      const lastSeenAt = new Date(record.lastSeenAt).getTime();
      return Number.isFinite(lastSeenAt) && lastSeenAt >= retentionCutoff;
    })
    .sort(
      ([, left], [, right]) =>
        new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()
    )
    .slice(0, READING_STATE_MAX_RECORDS);

  return {
    ...state,
    articles: Object.fromEntries(records)
  };
}

function isArticleReadingRecord(value: unknown): value is ArticleReadingRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<ArticleReadingRecord>;
  return (
    isIsoDate(record.firstSeenAt) &&
    isIsoDate(record.lastSeenAt) &&
    (record.readAt === undefined || isIsoDate(record.readAt))
  );
}

function normalizeOptionalIsoDate(value: unknown): string | null {
  return typeof value === "string" && isIsoDate(value) ? value : null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}
