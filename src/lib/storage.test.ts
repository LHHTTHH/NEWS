import { afterEach, describe, expect, it } from "vitest";
import {
  loadKeywords,
  loadReadingState,
  loadSavedArticles
} from "./storage";

describe("storage migration", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("recovers from invalid JSON without clearing default keywords", () => {
    const storage = new MemoryStorage({
      "ai-news-keywords": "{"
    });
    stubWindow(storage);

    expect(loadKeywords()).toEqual([]);
  });

  it("loads legacy saved articles and derives missing group size", () => {
    const storage = new MemoryStorage({
      "ai-news-saved-articles": JSON.stringify([
        {
          id: "saved",
          title: "Title",
          sourceName: "Source",
          publishedAt: "2026-05-17T09:00:00.000Z",
          summary: "Summary",
          articleUrl: "https://example.com",
          keyword: "AI",
          relatedLinks: [],
          savedAt: "2026-05-17T10:00:00.000Z"
        }
      ])
    });
    stubWindow(storage);

    expect(loadSavedArticles()[0].groupSize).toBe(1);
  });

  it("returns a safe empty reading state for malformed storage", () => {
    const storage = new MemoryStorage({
      "ai-news-reading-state-v1": JSON.stringify({
        articles: {
          broken: {
            firstSeenAt: "bad"
          }
        }
      })
    });
    stubWindow(storage);

    expect(loadReadingState()).toMatchObject({
      version: 1,
      articles: {}
    });
  });
});

class MemoryStorage {
  private readonly values = new Map<string, string>();

  constructor(initialValues: Record<string, string>) {
    Object.entries(initialValues).forEach(([key, value]) => this.values.set(key, value));
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function stubWindow(localStorage: MemoryStorage): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage
    }
  });
}
