type VercelRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  setHeader(name: string, value: string | string[]): void;
  status(code: number): VercelResponse;
  json(payload: unknown): void;
};

const AUTH_COOKIE_NAME = "news_auth";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SIGNATURE_VERSION = "v1";

declare const process: {
  env: Record<string, string | undefined>;
};

export function isAuthConfigured(): boolean {
  return Boolean(getAppPassword() && getAuthSecret());
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<boolean> {
  if (!isAuthConfigured()) {
    res.status(503).json({
      error: "認証設定が未完了です。NEWS_APP_PASSWORD を設定してください。"
    });
    return false;
  }

  if (await hasValidSession(req)) {
    return true;
  }

  res.status(401).json({
    error: "ログインが必要です。"
  });
  return false;
}

export async function hasValidSession(req: VercelRequest): Promise<boolean> {
  const cookieValue = parseCookies(req.headers?.cookie)[AUTH_COOKIE_NAME];
  if (!cookieValue) {
    return false;
  }

  const [version, expiresAtText, signature] = cookieValue.split(".");
  if (version !== SIGNATURE_VERSION || !expiresAtText || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const expectedSignature = await signSession(expiresAtText);
  return constantTimeEqual(signature, expectedSignature);
}

export function verifyPassword(password: string): boolean {
  const appPassword = getAppPassword();
  if (!appPassword) {
    return false;
  }

  return constantTimeEqual(password, appPassword);
}

export async function setAuthCookie(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const expiresAtText = String(expiresAt);
  const signature = await signSession(expiresAtText);
  const cookieValue = `${SIGNATURE_VERSION}.${expiresAtText}.${signature}`;

  res.setHeader(
    "Set-Cookie",
    serializeCookie(AUTH_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "Lax",
      secure: shouldUseSecureCookie(req)
    })
  );
}

export function clearAuthCookie(req: VercelRequest, res: VercelResponse): void {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "Lax",
      secure: shouldUseSecureCookie(req)
    })
  );
}

function getAppPassword(): string {
  return process.env.NEWS_APP_PASSWORD?.trim() ?? "";
}

function getAuthSecret(): string {
  return process.env.NEWS_AUTH_SECRET?.trim() || getAppPassword();
}

async function signSession(value: string): Promise<string> {
  const secret = getAuthSecret();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(signature);
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;
    difference |= leftCode ^ rightCode;
  }

  return difference === 0;
}

function parseCookies(cookieHeader?: string | string[]): Record<string, string> {
  const cookieText = Array.isArray(cookieHeader)
    ? cookieHeader.join(";")
    : cookieHeader ?? "";

  return Object.fromEntries(
    cookieText
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf("=");
        if (separatorIndex === -1) {
          return [cookie, ""];
        }

        return [
          cookie.slice(0, separatorIndex),
          decodeCookieValue(cookie.slice(separatorIndex + 1))
        ];
      })
  );
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    maxAge: number;
    path: string;
    sameSite: "Lax" | "Strict";
    secure: boolean;
  }
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`
  ];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function shouldUseSecureCookie(req: VercelRequest): boolean {
  const forwardedProto = req.headers?.["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return proto === "https" || Boolean(process.env.VERCEL);
}
