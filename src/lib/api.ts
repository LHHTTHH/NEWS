import type {
  ArticleContentResponse,
  NewsResponse
} from "../types";

export async function fetchNews(keywords: string[]): Promise<NewsResponse> {
  const params = new URLSearchParams();
  params.set("keywords", keywords.join(","));

  const response = await fetch(`/api/news?${params.toString()}`);
  const payload = (await response.json()) as NewsResponse & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "ニュースの取得に失敗しました。");
  }

  return {
    articles: payload.articles ?? [],
    partialFailureKeywords: payload.partialFailureKeywords ?? []
  };
}

export async function fetchArticleContent(
  articleUrl: string
): Promise<ArticleContentResponse> {
  const params = new URLSearchParams();
  params.set("url", articleUrl);

  const response = await fetch(`/api/article?${params.toString()}`);
  const payload = (await response.json()) as ArticleContentResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "本文の取得に失敗しました。");
  }

  return payload;
}
