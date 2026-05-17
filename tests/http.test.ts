import { describe, expect, it } from "vitest";
import { parseHttpUrl } from "../api/_http";

describe("parseHttpUrl", () => {
  it("accepts public HTTP(S) URLs", () => {
    expect(parseHttpUrl("https://example.com/path")?.toString()).toBe(
      "https://example.com/path"
    );
    expect(parseHttpUrl("http://news.example.com/")?.toString()).toBe(
      "http://news.example.com/"
    );
  });

  it("rejects unsafe or private URLs", () => {
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("https://user:pass@example.com/")).toBeNull();
    expect(parseHttpUrl("http://localhost/")).toBeNull();
    expect(parseHttpUrl("http://127.0.0.1/")).toBeNull();
    expect(parseHttpUrl("http://192.168.1.10/")).toBeNull();
    expect(parseHttpUrl("http://[::1]/")).toBeNull();
  });
});
