import { Readability } from "@mozilla/readability";
import GoogleNewsDecoder from "google-news-decoder";
import { DOMParser } from "linkedom";
import {
  fetchTextWithGuards,
  isGetRequest,
  logError,
  parseHttpUrl,
  setJsonHeaders
} from "./_http";

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

type ReadableDocument = {
  querySelectorAll(selectors: string): ArrayLike<{ textContent: string | null }>;
};

const googleNewsDecoder = new GoogleNewsDecoder();
const ARTICLE_FETCH_TIMEOUT_MS = 8000;
const ARTICLE_MAX_BYTES = 1_500_000;

function parseArticleUrl(req: VercelRequest): URL | null {
  const queryValue = req.query?.url;
  const rawUrl = Array.isArray(queryValue) ? queryValue[0] : queryValue;

  const candidate =
    rawUrl ??
    (req.url
      ? new URL(req.url, "http://localhost").searchParams.get("url") ?? undefined
      : undefined);

  if (!candidate) {
    return null;
  }

  return parseHttpUrl(candidate);
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractFallbackContent(document: ReadableDocument): string {
  const candidates = [
    ...Array.from(document.querySelectorAll("article p")),
    ...Array.from(document.querySelectorAll("main p"))
  ];

  const paragraphs = (candidates.length > 0
    ? candidates
    : Array.from(document.querySelectorAll("p")))
    .map((element) => normalizeText(element.textContent ?? ""))
    .filter((paragraph) => paragraph.length > 40);

  return normalizeText(paragraphs.join("\n\n"));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res);
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  if (!isGetRequest(req.method)) {
    res.status(405).json({
      error: "GET メソッドでアクセスしてください。"
    });
    return;
  }

  const requestedArticleUrl = parseArticleUrl(req);
  const articleUrl = requestedArticleUrl
    ? await decodeGoogleNewsUrl(requestedArticleUrl.toString())
    : null;
  if (!articleUrl) {
    res.status(400).json({
      error: "url クエリに公開 HTTP/HTTPS の記事URLを指定してください。"
    });
    return;
  }

  try {
    const fetchResult = await fetchTextWithGuards(articleUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8"
      },
      maxBytes: ARTICLE_MAX_BYTES,
      timeoutMs: ARTICLE_FETCH_TIMEOUT_MS
    });
    const contentType = fetchResult.response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html")) {
      res.status(415).json({
        error: "HTML記事として本文を抽出できませんでした。"
      });
      return;
    }

    const html = fetchResult.text;
    const document = new DOMParser().parseFromString(html, "text/html");
    const readableArticle = new Readability(document as unknown as Document).parse();
    const readableContent = normalizeText(readableArticle?.textContent ?? "");
    const fallbackContent = extractFallbackContent(document);
    const content = readableContent || fallbackContent;

    if (!content) {
      res.status(502).json({
        error: "本文を抽出できませんでした。"
      });
      return;
    }

    res.status(200).json({
      content,
      resolvedUrl: fetchResult.finalUrl
    });
  } catch (error) {
    logError("article_fetch_failed", error, {
      host: articleUrl.hostname
    });
    res.status(502).json({
      error: "本文取得中にエラーが発生しました。"
    });
  }
}

async function decodeGoogleNewsUrl(url: string): Promise<URL | null> {
  if (!url.includes("news.google.com/")) {
    return parseHttpUrl(url);
  }

  try {
    const decoded = await googleNewsDecoder.decodeGoogleNewsUrl(url);
    if (decoded.status && decoded.decodedUrl) {
      return parseHttpUrl(decoded.decodedUrl);
    }
  } catch {
    return parseHttpUrl(url);
  }

  return parseHttpUrl(url);
}
