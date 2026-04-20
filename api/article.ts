import { Readability } from "@mozilla/readability";
import GoogleNewsDecoder from "google-news-decoder";
import { DOMParser } from "linkedom";

type VercelRequest = {
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

function parseArticleUrl(req: VercelRequest): string | null {
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

  try {
    const parsedUrl = new URL(candidate);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
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
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  const requestedArticleUrl = parseArticleUrl(req);
  const articleUrl = requestedArticleUrl
    ? await decodeGoogleNewsUrl(requestedArticleUrl)
    : null;
  if (!articleUrl) {
    res.status(400).json({
      error: "url クエリに有効な記事URLを指定してください。"
    });
    return;
  }

  try {
    const response = await fetch(articleUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      res.status(502).json({
        error: "元記事の取得に失敗しました。"
      });
      return;
    }

    const html = await response.text();
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
      resolvedUrl: response.url
    });
  } catch {
    res.status(500).json({
      error: "本文取得中にエラーが発生しました。"
    });
  }
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
