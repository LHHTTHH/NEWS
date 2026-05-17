import { describe, expect, it } from "vitest";
import {
  collectKeywordResults,
  decodeHtmlEntities,
  groupArticles,
  normalizeComparableTitle,
  parseKeywords,
  toIsoDate
} from "./news";
import type { FlatArticle } from "./news";

describe("news grouping", () => {
  it("normalizes bracket noise, width, and known source suffixes", () => {
    expect(
      normalizeComparableTitle("【速報】ＡＩ新モデル発表 - Yahoo!ニュース")
    ).toBe("ai新モデル発表");
  });

  it("groups exact and near duplicate coverage under a stable topic id", () => {
    const groups = groupArticles([
      article({
        articleUrl: "https://example.com/a",
        normalizedComparableTitle: "openai new model release",
        publishedAt: "2026-05-17T09:00:00.000Z",
        title: "OpenAI new model release"
      }),
      article({
        articleUrl: "https://example.com/b",
        normalizedComparableTitle: "openai new model release",
        publishedAt: "2026-05-17T10:00:00.000Z",
        title: "OpenAI new model release - Reuters"
      }),
      article({
        articleUrl: "https://example.com/c",
        normalizedComparableTitle: "openai new model launch",
        publishedAt: "2026-05-17T08:00:00.000Z",
        summaryFingerprint: "openai new model release details",
        title: "OpenAI new model launch"
      })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "topic:openai new model launch",
      title: "OpenAI new model release - Reuters",
      groupSize: 3
    });
    expect(groups[0].relatedLinks).toHaveLength(2);
  });
});

describe("news parsing helpers", () => {
  it("deduplicates keyword input case-insensitively and rejects empties", () => {
    expect(
      parseKeywords({
        query: {
          keywords: " OpenAI,openai, , Gemini "
        }
      })
    ).toEqual(["OpenAI", "Gemini"]);
  });

  it("returns an empty date for missing or invalid published dates", () => {
    expect(toIsoDate()).toBe("");
    expect(toIsoDate("not-a-date")).toBe("");
  });

  it("keeps invalid numeric entities instead of throwing", () => {
    expect(decodeHtmlEntities("safe &#99999999; text")).toBe(
      "safe &#99999999; text"
    );
  });

  it("keeps fulfilled keyword results when another keyword fails", () => {
    const settled = collectKeywordResults(
      [
        {
          status: "fulfilled",
          value: [article({ articleUrl: "https://example.com/a" })]
        },
        {
          status: "rejected",
          reason: new Error("timeout")
        }
      ],
      ["OpenAI", "Gemini"]
    );

    expect(settled.collectedArticles).toHaveLength(1);
    expect(settled.failedKeywords).toEqual(["Gemini"]);
  });
});

function article(overrides: Partial<FlatArticle>): FlatArticle {
  return {
    id: "id",
    title: "OpenAI new model release",
    sourceName: "Example",
    publishedAt: "2026-05-17T09:00:00.000Z",
    summary: "OpenAI new model release details",
    articleUrl: "https://example.com/default",
    keyword: "OpenAI",
    normalizedTitle: "openai new model release",
    normalizedComparableTitle: "openai new model release",
    summaryFingerprint: "openai new model release details",
    ...overrides
  };
}
