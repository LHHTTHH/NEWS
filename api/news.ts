import { XMLParser } from "fast-xml-parser";
import type { NewsGroup, RelatedLink } from "../src/types";

type VercelRequest = {
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
};

const RSS_ITEM_LIMIT = 10;
const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true
});

function normalizeKeyword(keyword: string): string {
  return keyword.trim();
}

function normalizeTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || title.toLowerCase().trim();
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
    return [...new Set(queryValue.split(",").map(normalizeKeyword).filter(Boolean))].slice(0, 10);
  }

  if (Array.isArray(queryValue)) {
    return [
      ...new Set(
        queryValue.flatMap((value) => value.split(",")).map(normalizeKeyword).filter(Boolean)
      )
    ].slice(0, 10);
  }

  if (!req.url) {
    return [];
  }

  const parsedUrl = new URL(req.url, "http://localhost");
  const rawKeywords = parsedUrl.searchParams.get("keywords");

  if (!rawKeywords) {
    return [];
  }

  return [...new Set(rawKeywords.split(",").map(normalizeKeyword).filter(Boolean))].slice(0, 10);
}

async function fetchKeywordArticles(keyword: string): Promise<FlatArticle[]> {
  const searchParams = new URLSearchParams({
    q: keyword,
    hl: "ja",
    gl: "JP",
    ceid: "JP:ja"
  });
  const url = `https://news.google.com/rss/search?${searchParams.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`RSS request failed for keyword: ${keyword}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as ParsedRss;
  const rawItems = parsed.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.slice(0, RSS_ITEM_LIMIT).flatMap((item) => {
    const title = item.title?.trim();
    const link = item.link?.trim();

    if (!title || !link) {
      return [];
    }

    const normalizedTitle = normalizeTitle(title);
    const publishedAt = toIsoDate(item.pubDate);

    return [
      {
        id: `${normalizedTitle}::${link}`,
        title,
        sourceName: pickSourceName(item.source),
        publishedAt,
        summary: normalizeSummary(item.description),
        articleUrl: link,
        keyword,
        normalizedTitle
      }
    ];
  });
}

function groupArticles(articles: FlatArticle[]): NewsGroup[] {
  const grouped = new Map<string, FlatArticle[]>();

  for (const article of articles) {
    const groupKey = article.normalizedTitle;
    const group = grouped.get(groupKey);

    if (group) {
      group.push(article);
    } else {
      grouped.set(groupKey, [article]);
    }
  }

  return [...grouped.values()]
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
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

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

    if (collectedArticles.length === 0) {
      res.status(500).json({
        error: "ニュースを取得できませんでした。時間をおいて再度お試しください。"
      });
      return;
    }

    res.status(200).json({
      articles: groupArticles(collectedArticles)
    });
  } catch {
    res.status(500).json({
      error: "ニュースの取得中にエラーが発生しました。"
    });
  }
}
