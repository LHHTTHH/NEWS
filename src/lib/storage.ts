import type { SavedArticle } from "../types";

const KEYWORDS_STORAGE_KEY = "ai-news-keywords";
const KEYWORD_ENABLED_MAP_STORAGE_KEY = "ai-news-keyword-enabled-map";
const EXCLUDED_WORDS_STORAGE_KEY = "ai-news-excluded-words";
const EXCLUDED_SOURCES_STORAGE_KEY = "ai-news-excluded-sources";
const PERIOD_FILTER_STORAGE_KEY = "ai-news-period-filter";
const SAVED_ARTICLES_STORAGE_KEY = "ai-news-saved-articles";

function readJson<T>(storageKey: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey: string, value: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.warn("localStorage_write_failed", {
      storageKey,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function loadKeywords(): string[] {
  const keywords = readJson<string[]>(KEYWORDS_STORAGE_KEY, []);
  return Array.isArray(keywords)
    ? keywords.filter((keyword): keyword is string => typeof keyword === "string")
    : [];
}

export function saveKeywords(keywords: string[]): void {
  writeJson(KEYWORDS_STORAGE_KEY, keywords);
}

export function loadKeywordEnabledMap(): Record<string, boolean> {
  const enabledMap = readJson<Record<string, boolean>>(
    KEYWORD_ENABLED_MAP_STORAGE_KEY,
    {}
  );

  if (!enabledMap || typeof enabledMap !== "object" || Array.isArray(enabledMap)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(enabledMap).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
    )
  );
}

export function saveKeywordEnabledMap(
  enabledMap: Record<string, boolean>
): void {
  writeJson(KEYWORD_ENABLED_MAP_STORAGE_KEY, enabledMap);
}

export function loadExcludedWords(): string[] {
  const excludedWords = readJson<string[]>(EXCLUDED_WORDS_STORAGE_KEY, []);
  return Array.isArray(excludedWords)
    ? excludedWords.filter((word): word is string => typeof word === "string")
    : [];
}

export function saveExcludedWords(excludedWords: string[]): void {
  writeJson(EXCLUDED_WORDS_STORAGE_KEY, excludedWords);
}

export function loadExcludedSources(): string[] {
  const excludedSources = readJson<string[]>(EXCLUDED_SOURCES_STORAGE_KEY, []);
  return Array.isArray(excludedSources)
    ? excludedSources.filter((source): source is string => typeof source === "string")
    : [];
}

export function saveExcludedSources(excludedSources: string[]): void {
  writeJson(EXCLUDED_SOURCES_STORAGE_KEY, excludedSources);
}

export function loadPeriodFilter(): string {
  const periodFilter = readJson<string>(PERIOD_FILTER_STORAGE_KEY, "24h");
  return typeof periodFilter === "string" ? periodFilter : "24h";
}

export function savePeriodFilter(periodFilter: string): void {
  writeJson(PERIOD_FILTER_STORAGE_KEY, periodFilter);
}

export function loadSavedArticles(): SavedArticle[] {
  const articles = readJson<SavedArticle[]>(SAVED_ARTICLES_STORAGE_KEY, []);
  return Array.isArray(articles)
    ? articles.filter((article): article is SavedArticle => isSavedArticle(article))
    : [];
}

export function saveSavedArticles(articles: SavedArticle[]): void {
  writeJson(SAVED_ARTICLES_STORAGE_KEY, articles);
}

function isSavedArticle(value: unknown): value is SavedArticle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const article = value as Partial<SavedArticle>;
  return (
    typeof article.id === "string" &&
    typeof article.title === "string" &&
    typeof article.sourceName === "string" &&
    typeof article.publishedAt === "string" &&
    typeof article.summary === "string" &&
    typeof article.articleUrl === "string" &&
    typeof article.keyword === "string" &&
    typeof article.savedAt === "string" &&
    Array.isArray(article.relatedLinks)
  );
}
