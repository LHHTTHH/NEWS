import {
  AUTH_CONFIGURATION_ERROR_MESSAGE,
  isAuthConfigured,
  setAuthCookie,
  verifyPassword
} from "./_auth.js";
import { setJsonHeaders } from "./_http.js";

type VercelRequest = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  setHeader(name: string, value: string | string[]): void;
  status(code: number): VercelResponse;
  json(payload: unknown): void;
};

type LoginBody = {
  password?: unknown;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setJsonHeaders(res);
  res.setHeader("Cache-Control", "no-store");

  if (req.method?.toUpperCase() !== "POST") {
    res.status(405).json({
      error: "POST メソッドでアクセスしてください。"
    });
    return;
  }

  if (!isAuthConfigured()) {
    res.status(503).json({
      error: AUTH_CONFIGURATION_ERROR_MESSAGE
    });
    return;
  }

  const body = parseBody(req.body);
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyPassword(password)) {
    res.status(401).json({
      error: "パスワードが違います。"
    });
    return;
  }

  await setAuthCookie(req, res);
  res.status(200).json({
    authenticated: true
  });
}

function parseBody(body: unknown): LoginBody {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body) as LoginBody;
    } catch {
      return {};
    }
  }

  if (typeof body === "object") {
    return body as LoginBody;
  }

  return {};
}
