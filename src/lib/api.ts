import type {
  AuthResponse,
  ArticleContentResponse,
  NewsResponse
} from "../types";

export async function checkSession(): Promise<AuthResponse> {
  const response = await fetch("/api/session", {
    cache: "no-store"
  });
  const payload = await readJsonResponse<AuthResponse>(
    response,
    "API を含めて確認するには npm run dev:vercel を使ってください。"
  );

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
  const payload = await readJsonResponse<AuthResponse>(
    response,
    "ログインに失敗しました。"
  );

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
  const payload = await readJsonResponse<AuthResponse>(
    response,
    "ログアウトに失敗しました。"
  );

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
  const payload = await readJsonResponse<NewsResponse & { error?: string }>(
    response,
    "ニュースの取得に失敗しました。"
  );

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
  const payload = await readJsonResponse<ArticleContentResponse & {
    error?: string;
  }>(response, "本文の取得に失敗しました。");

  if (!response.ok) {
    throw new Error(payload.error ?? "本文の取得に失敗しました。");
  }

  return payload;
}

async function readJsonResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(fallbackMessage);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}
