import { describe, expect, it } from "vitest";
import {
  createEmptyReadingState,
  filterArticlesByReadingView,
  getReadingCounts,
  isArticleNewSince,
  isArticleRead,
  markArticlesRead,
  markSessionOpened,
  mergeSeenArticles,
  normalizeReadingState,
  pruneReadingState
} from "./reading";
import type { NewsGroup } from "../types";

describe("reading state", () => {
  it("tracks first-seen time, unread state, and previous-session newness", () => {
    const previousSessionAt = "2026-05-17T06:00:00.000Z";
    const openedState = markSessionOpened(createEmptyReadingState(), previousSessionAt);
    const mergedState = mergeSeenArticles(
      openedState,
      [group({ id: "new" })],
      "2026-05-17T09:00:00.000Z"
    );

    expect(isArticleRead(mergedState, "new")).toBe(false);
    expect(isArticleNewSince(mergedState, "new", previousSessionAt)).toBe(true);
  });

  it("filters unread and new views independently", () => {
    const baseState = mergeSeenArticles(
      createEmptyReadingState(),
      [group({ id: "old" }), group({ id: "new" })],
      "2026-05-17T09:00:00.000Z"
    );
    const readState = markArticlesRead(baseState, ["old"], "2026-05-17T09:30:00.000Z");
    const articles = [group({ id: "old" }), group({ id: "new" })];

    expect(
      filterArticlesByReadingView(
        articles,
        readState,
        "unread",
        "2026-05-17T08:00:00.000Z"
      ).map((article) => article.id)
    ).toEqual(["new"]);
    expect(getReadingCounts(articles, readState, "2026-05-17T08:00:00.000Z")).toEqual({
      newCount: 2,
      unreadCount: 1,
      readCount: 1
    });
  });

  it("normalizes corrupted state without discarding valid records", () => {
    const normalized = normalizeReadingState({
      version: 99,
      lastOpenedAt: "not-a-date",
      lastReadAt: "2026-05-17T09:30:00.000Z",
      articles: {
        valid: {
          firstSeenAt: "2026-05-17T09:00:00.000Z",
          lastSeenAt: "2026-05-17T09:10:00.000Z"
        },
        broken: {
          firstSeenAt: "bad"
        }
      }
    });

    expect(normalized.lastOpenedAt).toBeNull();
    expect(Object.keys(normalized.articles)).toEqual(["valid"]);
  });

  it("prunes stale records", () => {
    const state = normalizeReadingState({
      version: 1,
      lastOpenedAt: null,
      lastReadAt: null,
      articles: {
        stale: {
          firstSeenAt: "2025-01-01T00:00:00.000Z",
          lastSeenAt: "2025-01-01T00:00:00.000Z"
        },
        fresh: {
          firstSeenAt: "2026-05-17T09:00:00.000Z",
          lastSeenAt: "2026-05-17T09:00:00.000Z"
        }
      }
    });

    expect(
      Object.keys(pruneReadingState(state, Date.parse("2026-05-17T12:00:00.000Z")).articles)
    ).toEqual(["fresh"]);
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
