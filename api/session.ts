import { hasValidSession, isAuthConfigured } from "./_auth.js";
import { isGetRequest, setJsonHeaders } from "./_http.js";

type VercelRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(payload: unknown): void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res);
  res.setHeader("Cache-Control", "no-store");

  if (!isGetRequest(req.method)) {
    res.status(405).json({
      error: "GET メソッドでアクセスしてください。"
    });
    return;
  }

  if (!isAuthConfigured()) {
    res.status(503).json({
      authenticated: false,
      error: "認証設定が未完了です。NEWS_APP_PASSWORD を設定してください。"
    });
    return;
  }

  res.status(200).json({
    authenticated: await hasValidSession(req)
  });
}
