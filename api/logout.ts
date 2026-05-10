import { clearAuthCookie } from "./_auth.js";
import { isGetRequest, setJsonHeaders } from "./_http.js";

type VercelRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader(name: string, value: string | string[]): void;
  status(code: number): VercelResponse;
  json(payload: unknown): void;
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res);
  res.setHeader("Cache-Control", "no-store");

  if (!isGetRequest(req.method) && req.method?.toUpperCase() !== "POST") {
    res.status(405).json({
      error: "GET または POST メソッドでアクセスしてください。"
    });
    return;
  }

  clearAuthCookie(req, res);
  res.status(200).json({
    authenticated: false
  });
}
