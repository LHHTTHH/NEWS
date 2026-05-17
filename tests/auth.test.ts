import { afterEach, describe, expect, it, vi } from "vitest";
import loginHandler from "../api/login";
import sessionHandler from "../api/session";
import {
  AUTH_CONFIGURATION_ERROR_MESSAGE,
  hasValidSession,
  isAuthConfigured,
  setAuthCookie
} from "../api/_auth";

class MockResponse {
  headers: Record<string, string | string[]> = {};
  statusCode = 200;
  body: unknown;

  setHeader(name: string, value: string | string[]): void {
    this.headers[name.toLowerCase()] = value;
  }

  status(code: number): MockResponse {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown): void {
    this.body = payload;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth configuration", () => {
  it("requires NEWS_AUTH_SECRET instead of falling back to the app password", async () => {
    vi.stubEnv("NEWS_APP_PASSWORD", "app-password");
    vi.stubEnv("NEWS_AUTH_SECRET", "");

    expect(isAuthConfigured()).toBe(false);

    const expiresAt = String(Date.now() + 60_000);
    const appPasswordSignature = await signSessionWithSecret(
      "app-password",
      expiresAt
    );

    await expect(
      hasValidSession({
        headers: {
          cookie: `news_auth=v1.${expiresAt}.${appPasswordSignature}`
        }
      })
    ).resolves.toBe(false);
  });

  it("reports missing auth configuration without issuing a session cookie", async () => {
    vi.stubEnv("NEWS_APP_PASSWORD", "app-password");
    vi.stubEnv("NEWS_AUTH_SECRET", "");
    const res = new MockResponse();

    await loginHandler(
      {
        method: "POST",
        body: {
          password: "app-password"
        }
      },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: AUTH_CONFIGURATION_ERROR_MESSAGE
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("reports unauthenticated session state when auth configuration is missing", async () => {
    vi.stubEnv("NEWS_APP_PASSWORD", "app-password");
    vi.stubEnv("NEWS_AUTH_SECRET", "");
    const res = new MockResponse();

    await sessionHandler(
      {
        method: "GET"
      },
      res
    );

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      authenticated: false,
      error: AUTH_CONFIGURATION_ERROR_MESSAGE
    });
  });

  it("does not create a session cookie without NEWS_AUTH_SECRET", async () => {
    vi.stubEnv("NEWS_APP_PASSWORD", "app-password");
    vi.stubEnv("NEWS_AUTH_SECRET", "");
    const res = new MockResponse();

    await expect(
      setAuthCookie(
        {
          headers: {}
        },
        res
      )
    ).rejects.toThrow("NEWS_AUTH_SECRET");
  });
});

describe("hasValidSession", () => {
  it("treats malformed cookie encodings as an invalid session", async () => {
    configureAuth();

    await expect(
      hasValidSession({
        headers: {
          cookie: "news_auth=%E0%A4%A"
        }
      })
    ).resolves.toBe(false);
  });

  it("accepts cookies signed with NEWS_AUTH_SECRET", async () => {
    configureAuth();
    const res = new MockResponse();

    await setAuthCookie(
      {
        headers: {
          "x-forwarded-proto": "https"
        }
      },
      res
    );

    const cookie = getCookiePair(res.headers["set-cookie"]);
    expect(String(res.headers["set-cookie"])).toContain("HttpOnly");
    expect(String(res.headers["set-cookie"])).toContain("SameSite=Lax");
    expect(String(res.headers["set-cookie"])).toContain("Secure");

    await expect(
      hasValidSession({
        headers: {
          cookie
        }
      })
    ).resolves.toBe(true);
  });

  it("rejects signatures made with the app password", async () => {
    configureAuth();
    const expiresAt = String(Date.now() + 60_000);
    const appPasswordSignature = await signSessionWithSecret(
      "app-password",
      expiresAt
    );

    await expect(
      hasValidSession({
        headers: {
          cookie: `news_auth=v1.${expiresAt}.${appPasswordSignature}`
        }
      })
    ).resolves.toBe(false);
  });
});

function configureAuth(): void {
  vi.stubEnv("NEWS_APP_PASSWORD", "app-password");
  vi.stubEnv("NEWS_AUTH_SECRET", "auth-secret");
}

function getCookiePair(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie ?? "";
  return header.split(";")[0];
}

async function signSessionWithSecret(
  secret: string,
  value: string
): Promise<string> {
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
  return Buffer.from(signature)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
