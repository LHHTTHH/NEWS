import type {
  AuthResponse,
  ArticleContentResponse,
  NewsResponse
} from "../types";

export async function checkSession(): Promise<AuthResponse> {
  const response = await fetch("/api/session", {
    cache: "no-store"
  });
  const payload = (await response.json()) as AuthResponse;

  if (!response.ok && response.status !== 401) {
    throw new Error(payload.error ?? "ログイン状態の確認に失敗しました。");
  }

  return {
    authenticated: Boolean(payload.authenticated),
    error: payload.error
  };
}

export async function login(password: string): Promise<AuthResponse> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });
  const payload = (await response.json()) as AuthResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "ログインに失敗しました。");
  }

  return {
    authenticated: Boolean(payload.authenticated)
  };
}

export async function logout(): Promise<AuthResponse> {
  const response = await fetch("/api/logout", {
    method: "POST"
  });
  const payload = (await response.json()) as AuthResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "ログアウトに失敗しました。");
  }

  return {
    authenticated: Boolean(payload.authenticated)
  };
}

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
