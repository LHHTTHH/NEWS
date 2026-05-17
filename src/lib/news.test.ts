import { describe, expect, it } from "vitest";
import {
  filterNewsArticles,
  isArticleInPeriod,
  matchesExcludedWords,
  normalizeSourceName
} from "./news";
import type { NewsGroup } from "../types";

describe("news filters", () => {
  const now = Date.parse("2026-05-17T12:00:00.000Z");

  it("keeps only articles inside the selected period and rejects invalid or future dates", () => {
    expect(isArticleInPeriod("2026-05-16T13:00:00.000Z", "24h", now)).toBe(true);
    expect(isArticleInPeriod("2026-05-16T11:59:59.000Z", "24h", now)).toBe(false);
    expect(isArticleInPeriod("", "7d", now)).toBe(false);
    expect(isArticleInPeriod("2026-05-17T12:30:00.000Z", "7d", now)).toBe(false);
  });

  it("matches excluded words case-insensitively after unicode normalization", () => {
    expect(
      matchesExcludedWords(
        {
          title: "ＡＩ Hiring update",
          summary: "Careers"
        },
        ["ai hiring"]
      )
    ).toBe(true);
  });

  it("normalizes source names and reports filter counts", () => {
    const result = filterNewsArticles(
      [
        group({ id: "fresh", sourceName: " Reuters " }),
        group({ id: "old", publishedAt: "2026-05-10T12:00:00.000Z" }),
        group({ id: "word", title: "Sponsored launch" })
      ],
      {
        excludedSources: ["reuters"],
        excludedWords: ["sponsored"],
        periodFilter: "7d",
        now
      }
    );

    expect(normalizeSourceName(" Reuters ")).toBe("reuters");
    expect(result.visibleArticles).toHaveLength(0);
    expect(result.periodExcludedCount).toBe(1);
    expect(result.sourceExcludedCount).toBe(1);
    expect(result.wordExcludedCount).toBe(1);
  });
});

function group(overrides: Partial<NewsGroup>): NewsGroup {
  return {
    id: "id",
    title: "Title",
    sourceName: "Example",
    publishedAt: "2026-05-17T09:00:00.000Z",
    summary: "Summary",
    articleUrl: "https://example.com/article",
    keyword: "AI",
    relatedLinks: [],
    groupSize: 1,
    ...overrides
  };
}
