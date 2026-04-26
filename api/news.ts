import { XMLParser } from "fast-xml-parser";
import GoogleNewsDecoder from "google-news-decoder";
import type { NewsGroup, RelatedLink } from "../src/types";
import { fetchWithTimeout, isGetRequest, logWarning, setJsonHeaders } from "./_http";

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(payload: unknown): void;
};

type RssSource = {
  "#text"?: string;
  __text?: string;
};

type RssItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  source?: string | RssSource;
};

type ParsedRss = {
  rss?: {
    channel?: {
      item?: RssItem | RssItem[];
    };
  };
};

type FlatArticle = {
  id: string;
  title: string;
  sourceName: string;
  publishedAt: string;
  summary: string;
  articleUrl: string;
  keyword: string;
  normalizedTitle: string;
  normalizedComparableTitle: string;
  summaryFingerprint: string;
};

const RSS_ITEM_LIMIT = 10;
const MAX_KEYWORDS = 10;
const MAX_KEYWORD_LENGTH = 80;
const RSS_FETCH_TIMEOUT_MS = 8000;
const googleNewsDecoder = new GoogleNewsDecoder();
const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});
const TITLE_NOISE_PATTERNS = [
  /\b(?:yahoo!?\s*ニュース)\b/giu,
  /\b(?:ロイター|reuters|共同通信|共同|時事通信|時事|afp|ap)\b/giu,
  /\b(?:配信|提供)\b/giu,
  /\b(?:速報|写真特集|動画)\b/giu
];

function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").slice(0, MAX_KEYWORD_LENGTH);
}

function normalizeTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || title.toLowerCase().trim();
}

function normalizeComparableTitle(title: string): string {
  let normalized = normalizeTitle(title);

  for (const pattern of TITLE_NOISE_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }

  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized || normalizeTitle(title);
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&quot;": "\"",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&hellip;": "...",
  "&mdash;": "-",
  "&ndash;": "-",
  "&laquo;": "\"",
  "&raquo;": "\"",
  "&ldquo;": "\"",
  "&rdquo;": "\"",
  "&lsquo;": "'",
  "&rsquo;": "'"
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#\d+|#x[0-9a-fA-F]+|\w+);/g, (entity) => {
    if (entity in HTML_ENTITY_MAP) {
      return HTML_ENTITY_MAP[entity];
    }

    if (entity.startsWith("&#x") || entity.startsWith("&#X")) {
      const codePoint = Number.parseInt(entity.slice(3, -1), 16);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    if (entity.startsWith("&#")) {
      const codePoint = Number.parseInt(entity.slice(2, -1), 10);
      return Number.isNaN(codePoint) ? entity : String.fromCodePoint(codePoint);
    }

    return entity;
  });
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\u00a0/g, " ");
}

function normalizeTextContent(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSourceName(source: RssItem["source"]): string {
  if (typeof source === "string" && source.trim()) {
    return source.trim();
  }

  if (source && typeof source === "object") {
    if (typeof source["#text"] === "string" && source["#text"].trim()) {
      return source["#text"].trim();
    }

    if (typeof source.__text === "string" && source.__text.trim()) {
      return source.__text.trim();
    }
  }

  return "媒体名不明";
}

function normalizeSummary(description?: string): string {
  if (!description) {
    return "要約はまだ取得できていません。";
  }

  const cleaned = normalizeTextContent(stripHtml(description));
  if (!cleaned) {
    return "要約はまだ取得できていません。";
  }

  return cleaned.length > 180 ? `${cleaned.slice(0, 180).trim()}...` : cleaned;
}

function buildTextFingerprint(value: string): string {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "by",
    "at",
    "from",
    "ai",
    "news"
  ]);

  const tokens = normalizeTextContent(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));

  return [...new Set(tokens)].sort().join(" ");
}

function computeOverlapScore(left: string, right: string): number {
  const leftTokens = left.split(" ").filter(Boolean);
  const rightTokens = right.split(" ").filter(Boolean);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let intersectionSize = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersectionSize += 1;
    }
  }

  return intersectionSize / Math.max(leftSet.size, rightSet.size);
}

function isLikelyDuplicateArticle(left: FlatArticle, right: FlatArticle): boolean {
  if (left.articleUrl === right.articleUrl) {
    return true;
  }

  if (left.normalizedComparableTitle === right.normalizedComparableTitle) {
    return true;
  }

  const titleOverlapScore = computeOverlapScore(
    buildTextFingerprint(left.normalizedComparableTitle),
    buildTextFingerprint(right.normalizedComparableTitle)
  );

  const summaryOverlapScore = computeOverlapScore(
    left.summaryFingerprint,
    right.summaryFingerprint
  );

  return titleOverlapScore >= 0.8 || (titleOverlapScore >= 0.6 && summaryOverlapScore >= 0.45);
}

function toIsoDate(value?: string): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date(0).toISOString();
  }

  return parsedDate.toISOString();
}

function parseKeywords(req: VercelRequest): string[] {
  const queryValue = req.query?.keywords;

  if (typeof queryValue === "string") {
    return [...new Set(queryValue.split(",").map(normalizeKeyword).filter(Boolean))].slice(0, MAX_KEYWORDS);
  }

  if (Array.isArray(queryValue)) {
    return [
      ...new Set(
        queryValue.flatMap((value) => value.split(",")).map(normalizeKeyword).filter(Boolean)
      )
    ].slice(0, MAX_KEYWORDS);
  }

  if (!req.url) {
    return [];
  }

  const parsedUrl = new URL(req.url, "http://localhost");
  const rawKeywords = parsedUrl.searchParams.get("keywords");

  if (!rawKeywords) {
    return [];
  }

  return [...new Set(rawKeywords.split(",").map(normalizeKeyword).filter(Boolean))].slice(0, MAX_KEYWORDS);
}

async function fetchKeywordArticles(keyword: string): Promise<FlatArticle[]> {
  const searchParams = new URLSearchParams({
    q: keyword,
    hl: "ja",
    gl: "JP",
    ceid: "JP:ja"
  });
  const url = `https://news.google.com/rss/search?${searchParams.toString()}`;

  const response = await fetchWithTimeout(url, {}, RSS_FETCH_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`RSS request failed for keyword: ${keyword}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as ParsedRss;
  const rawItems = parsed.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  const articles = await Promise.all(
    items.slice(0, RSS_ITEM_LIMIT).map(async (item) => {
      const title = item.title?.trim();
      const link = item.link?.trim();

      if (!title || !link) {
        return null;
      }

      const normalizedTitle = normalizeTitle(title);
      const normalizedComparableTitle = normalizeComparableTitle(title);
      const publishedAt = toIsoDate(item.pubDate);
      const articleUrl = await decodeGoogleNewsUrl(link);
      const summary = normalizeSummary(item.description);

      return {
        id: `${normalizedTitle}::${articleUrl}`,
        title,
        sourceName: pickSourceName(item.source),
        publishedAt,
        summary,
        articleUrl,
        keyword,
        normalizedTitle,
        normalizedComparableTitle,
        summaryFingerprint: buildTextFingerprint(summary)
      };
    })
  );

  return articles.filter((article): article is FlatArticle => article !== null);
}

async function decodeGoogleNewsUrl(url: string): Promise<string> {
  if (!url.includes("news.google.com/")) {
    return url;
  }

  try {
    const decoded = await googleNewsDecoder.decodeGoogleNewsUrl(url);
    if (decoded.status && decoded.decodedUrl) {
      return decoded.decodedUrl;
    }
  } catch {
    return url;
  }

  return url;
}

function groupArticles(articles: FlatArticle[]): NewsGroup[] {
  const grouped: FlatArticle[][] = [];

  for (const article of articles) {
    const existingGroup = grouped.find((group) =>
      group.some((groupedArticle) => isLikelyDuplicateArticle(groupedArticle, article))
    );

    if (existingGroup) {
      existingGroup.push(article);
    } else {
      grouped.push([article]);
    }
  }

  return grouped
    .map((groupArticlesForTitle) => {
      const sortedGroup = [...groupArticlesForTitle].sort(
        (left, right) =>
          new Date(right.publishedAt).getTime() -
          new Date(left.publishedAt).getTime()
      );

      const representative = sortedGroup[0];
      const relatedLinks: RelatedLink[] = sortedGroup.slice(1).map((article) => ({
        title: article.title,
        sourceName: article.sourceName,
        publishedAt: article.publishedAt,
        articleUrl: article.articleUrl,
        keyword: article.keyword
      }));

      return {
        id: representative.id,
        title: representative.title,
        sourceName: representative.sourceName,
        publishedAt: representative.publishedAt,
        summary: representative.summary,
        articleUrl: representative.articleUrl,
        keyword: representative.keyword,
        relatedLinks
      };
    })
    .sort(
      (left, right) =>
        new Date(right.publishedAt).getTime() -
        new Date(left.publishedAt).getTime()
    );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res);
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (!isGetRequest(req.method)) {
    res.status(405).json({
      error: "GET メソッドでアクセスしてください。"
    });
    return;
  }

  const keywords = parseKeywords(req);

  if (keywords.length === 0) {
    res.status(400).json({
      error: "keywords クエリに1件以上のキーワードを指定してください。"
    });
    return;
  }

  try {
    const results = await Promise.allSettled(
      keywords.map((keyword) => fetchKeywordArticles(keyword))
    );

    const collectedArticles = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
    const failedKeywords = results.flatMap((result, index) =>
      result.status === "rejected" ? [keywords[index]] : []
    );

    if (failedKeywords.length > 0) {
      logWarning("news_keyword_fetch_failed", {
        failedKeywords,
        requestedKeywords: keywords.length
      });
    }

    if (collectedArticles.length === 0) {
      res.status(502).json({
        error: "ニュースを取得できませんでした。時間をおいて再度お試しください。"
      });
      return;
    }

    res.status(200).json({
      articles: groupArticles(collectedArticles),
      partialFailureKeywords: failedKeywords
    });
  } catch (error) {
    logWarning("news_fetch_unexpected_error", {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: "ニュースの取得中にエラーが発生しました。"
    });
  }
}
