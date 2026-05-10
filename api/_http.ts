type FetchTextOptions = {
  headers?: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
};

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);
const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./
];

export function setJsonHeaders(res: {
  setHeader(name: string, value: string): void;
}): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function isGetRequest(method?: string): boolean {
  return !method || method.toUpperCase() === "GET";
}

export function parseHttpUrl(value: string): URL | null {
  try {
    const parsedUrl = new URL(value);

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    if (parsedUrl.username || parsedUrl.password || !isPublicHostname(parsedUrl.hostname)) {
      return null;
    }

    return parsedUrl;
  } catch {
    return null;
  }
}

export async function fetchTextWithGuards(
  url: URL,
  options: FetchTextOptions
): Promise<{ text: string; finalUrl: string; response: Response }> {
  const maxRedirects = options.maxRedirects ?? 3;
  let nextUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    assertPublicUrl(nextUrl);

    const response = await fetchWithTimeout(nextUrl.toString(), {
      headers: options.headers,
      redirect: "manual"
    }, options.timeoutMs);

    if (isRedirectResponse(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect response did not include a location header.");
      }

      nextUrl = new URL(location, nextUrl);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Upstream responded with ${response.status}.`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > options.maxBytes) {
      throw new Error("Upstream response is too large.");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > options.maxBytes) {
      throw new Error("Upstream response exceeded the allowed size.");
    }

    return {
      text: decodeResponseText(buffer, response.headers.get("content-type")),
      finalUrl: response.url || nextUrl.toString(),
      response
    };
  }

  throw new Error("Too many upstream redirects.");
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function logWarning(message: string, details?: Record<string, unknown>): void {
  console.warn(message, details ?? {});
}

export function logError(message: string, error: unknown, details?: Record<string, unknown>): void {
  console.error(message, {
    ...details,
    error: error instanceof Error ? error.message : String(error)
  });
}

function assertPublicUrl(url: URL): void {
  if (!parseHttpUrl(url.toString())) {
    throw new Error("URL is not allowed.");
  }
}

function isPublicHostname(hostname: string): boolean {
  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  if (
    BLOCKED_HOSTNAMES.has(normalizedHostname) ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local")
  ) {
    return false;
  }

  if (isIpv4Literal(normalizedHostname)) {
    return !PRIVATE_IPV4_RANGES.some((range) => range.test(normalizedHostname));
  }

  if (isIpv6Literal(normalizedHostname)) {
    return !(
      normalizedHostname === "::1" ||
      normalizedHostname.startsWith("fc") ||
      normalizedHostname.startsWith("fd") ||
      normalizedHostname.startsWith("fe80")
    );
  }

  return true;
}

function isIpv4Literal(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) {
        return false;
      }

      const octet = Number(part);
      return octet >= 0 && octet <= 255;
    })
  );
}

function isIpv6Literal(value: string): boolean {
  return value.includes(":");
}

function isRedirectResponse(status: number): boolean {
  return status >= 300 && status < 400;
}

function decodeResponseText(buffer: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buffer);
  const headerEncoding = normalizeEncoding(extractCharset(contentType ?? ""));
  const sniffedEncoding = normalizeEncoding(sniffHtmlEncoding(bytes));
  const encodings = [
    headerEncoding,
    sniffedEncoding,
    "utf-8",
    "shift_jis",
    "euc-jp"
  ].filter((encoding, index, allEncodings): encoding is string =>
    Boolean(encoding) && allEncodings.indexOf(encoding) === index
  );

  for (const encoding of encodings) {
    try {
      const decodedText = new TextDecoder(encoding, {
        fatal: encoding !== "utf-8"
      }).decode(bytes);

      if (!looksMojibake(decodedText)) {
        return decodedText;
      }
    } catch {
      // Try the next candidate encoding.
    }
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function extractCharset(contentType: string): string | null {
  return contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? null;
}

function sniffHtmlEncoding(bytes: Uint8Array): string | null {
  const sample = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
  return (
    sample.match(/<meta[^>]+charset\s*=\s*["']?\s*([^"'\s/>]+)/i)?.[1] ??
    sample.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^"'\s;]+)/i)?.[1] ??
    null
  );
}

function normalizeEncoding(encoding?: string | null): string | null {
  if (!encoding) {
    return null;
  }

  const normalized = encoding.trim().toLowerCase().replace(/_/g, "-");

  if (["shift-jis", "shift_jis", "sjis", "windows-31j", "x-sjis"].includes(normalized)) {
    return "shift_jis";
  }

  if (["eucjp", "euc-jp", "x-euc-jp"].includes(normalized)) {
    return "euc-jp";
  }

  if (["utf8", "utf-8"].includes(normalized)) {
    return "utf-8";
  }

  return normalized;
}

function looksMojibake(value: string): boolean {
  const sample = value.slice(0, 4000);
  const replacementCount = (sample.match(/\uFFFD/g) ?? []).length;
  const mojibakeCount = (sample.match(/[ÃÂãäåæçèéêëìíîïðñòóôõöøùúûüýþï¿½]/g) ?? [])
    .length;

  return replacementCount > 3 || mojibakeCount > 16;
}
