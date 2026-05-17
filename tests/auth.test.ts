import { describe, expect, it } from "vitest";
import { hasValidSession } from "../api/_auth";

describe("hasValidSession", () => {
  it("treats malformed cookie encodings as an invalid session", async () => {
    await expect(
      hasValidSession({
        headers: {
          cookie: "news_auth=%E0%A4%A"
        }
      })
    ).resolves.toBe(false);
  });
});
