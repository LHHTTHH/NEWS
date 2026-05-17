import { describe, expect, it } from "vitest";
import { isSavedArticle } from "../src/lib/storage";

const validSavedArticle = {
  id: "article-1",
  title: "Example title",
  sourceName: "Example News",
  publishedAt: "2026-05-16T00:00:00.000Z",
  summary: "Example summary",
  articleUrl: "https://example.com/article",
  keyword: "AI",
  savedAt: "2026-05-16T01:00:00.000Z",
  relatedLinks: [
    {
      title: "Related article",
      sourceName: "Example News",
      publishedAt: "2026-05-16T00:30:00.000Z",
      articleUrl: "https://example.com/related",
      keyword: "AI"
    }
  ],
  groupSize: 2
};

describe("isSavedArticle", () => {
  it("accepts current and legacy saved article shapes", () => {
    expect(isSavedArticle(validSavedArticle)).toBe(true);
    expect(
      isSavedArticle({
        ...validSavedArticle,
        groupSize: undefined
      })
    ).toBe(true);
  });

  it("rejects unsafe URLs and malformed nested links", () => {
    expect(
      isSavedArticle({
        ...validSavedArticle,
        articleUrl: "javascript:alert(1)"
      })
    ).toBe(false);

    expect(
      isSavedArticle({
        ...validSavedArticle,
        relatedLinks: [
          {
            ...validSavedArticle.relatedLinks[0],
            articleUrl: "https://user:pass@example.com/related"
          }
        ]
      })
    ).toBe(false);
  });

  it("rejects invalid dates and group sizes", () => {
    expect(
      isSavedArticle({
        ...validSavedArticle,
        savedAt: "not-a-date"
      })
    ).toBe(false);

    expect(
      isSavedArticle({
        ...validSavedArticle,
        groupSize: 0
      })
    ).toBe(false);
  });
});
