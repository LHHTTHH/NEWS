import { describe, expect, it } from "vitest";
import {
  getReadingViewDescription,
  isAuthConfigurationError
} from "./dashboard";

describe("dashboard UI helpers", () => {
  it("explains each reading view with the right first-session wording", () => {
    expect(getReadingViewDescription("new", null)).toContain("初回表示");
    expect(
      getReadingViewDescription("new", "2026-05-17T09:00:00.000Z")
    ).toContain("前回閲覧後");
    expect(getReadingViewDescription("unread", null)).toContain("既読");
    expect(getReadingViewDescription("all", null)).toContain("除外条件");
  });

  it("detects auth configuration errors without inspecting secret values", () => {
    expect(
      isAuthConfigurationError(
        "認証設定が未完了です。NEWS_APP_PASSWORD と NEWS_AUTH_SECRET を設定してください。"
      )
    ).toBe(true);
    expect(isAuthConfigurationError("パスワードが違います。")).toBe(false);
    expect(isAuthConfigurationError(null)).toBe(false);
  });
});
