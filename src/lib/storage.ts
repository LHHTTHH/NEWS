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

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

export function loadKeywords(): string[] {
  const keywords = readJson<string[]>(KEYWORDS_STORAGE_KEY, []);
  return Array.isArray(keywords) ? keywords : [];
}

export function saveKeywords(keywords: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(keywords));
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
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    KEYWORD_ENABLED_MAP_STORAGE_KEY,
    JSON.stringify(enabledMap)
  );
}

export function loadExcludedWords(): string[] {
  const excludedWords = readJson<string[]>(EXCLUDED_WORDS_STORAGE_KEY, []);
  return Array.isArray(excludedWords) ? excludedWords : [];
}

export function saveExcludedWords(excludedWords: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    EXCLUDED_WORDS_STORAGE_KEY,
    JSON.stringify(excludedWords)
  );
}

export function loadExcludedSources(): string[] {
  const excludedSources = readJson<string[]>(EXCLUDED_SOURCES_STORAGE_KEY, []);
  return Array.isArray(excludedSources) ? excludedSources : [];
}

export function saveExcludedSources(excludedSources: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    EXCLUDED_SOURCES_STORAGE_KEY,
    JSON.stringify(excludedSources)
  );
}

export function loadPeriodFilter(): string {
  const periodFilter = readJson<string>(PERIOD_FILTER_STORAGE_KEY, "24h");
  return typeof periodFilter === "string" ? periodFilter : "24h";
}

export function savePeriodFilter(periodFilter: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PERIOD_FILTER_STORAGE_KEY,
    JSON.stringify(periodFilter)
  );
}

export function loadSavedArticles(): SavedArticle[] {
  const articles = readJson<SavedArticle[]>(SAVED_ARTICLES_STORAGE_KEY, []);
  return Array.isArray(articles) ? articles : [];
}

export function saveSavedArticles(articles: SavedArticle[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SAVED_ARTICLES_STORAGE_KEY,
    JSON.stringify(articles)
  );
}
