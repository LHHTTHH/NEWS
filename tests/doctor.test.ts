import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("doctor", () => {
  it("reports configuration without printing secret values", () => {
    const result = spawnSync(process.execPath, ["scripts/doctor.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NEWS_APP_PASSWORD: "doctor-password",
        NEWS_AUTH_SECRET: "doctor-secret"
      }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("NEWS_APP_PASSWORD: configured");
    expect(result.stdout).toContain("NEWS_AUTH_SECRET: configured");
    expect(result.stdout).not.toMatch(/doctor-password|doctor-secret/);
  });

  it("exits non-zero when the required password is missing", () => {
    const result = spawnSync(process.execPath, ["scripts/doctor.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NEWS_APP_PASSWORD: "",
        NEWS_AUTH_SECRET: ""
      }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("NEWS_APP_PASSWORD: missing");
    expect(result.stdout).toContain("NEWS_AUTH_SECRET: missing");
  });

  it("exits non-zero when NEWS_AUTH_SECRET is missing", () => {
    const result = spawnSync(process.execPath, ["scripts/doctor.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NEWS_APP_PASSWORD: "doctor-password",
        NEWS_AUTH_SECRET: ""
      }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("NEWS_APP_PASSWORD: configured");
    expect(result.stdout).toContain(
      "NEWS_AUTH_SECRET: missing (required; no fallback)"
    );
    expect(result.stdout).not.toMatch(/doctor-password/);
  });
});
