const requiredNodeMajor = 18;
const nodeMajor = Number(process.versions.node.split(".")[0]);
const hasAppPassword = Boolean(process.env.NEWS_APP_PASSWORD?.trim());
const hasAuthSecret = Boolean(process.env.NEWS_AUTH_SECRET?.trim());

const checks = [
  {
    name: "Node.js",
    ok: Number.isFinite(nodeMajor) && nodeMajor >= requiredNodeMajor,
    detail: `v${process.versions.node}`
  },
  {
    name: "NEWS_APP_PASSWORD",
    ok: hasAppPassword,
    detail: hasAppPassword ? "configured" : "missing"
  },
  {
    name: "NEWS_AUTH_SECRET",
    ok: hasAuthSecret,
    detail: hasAuthSecret ? "configured" : "missing (required; no fallback)"
  }
];

console.log("AI News doctor");

for (const check of checks) {
  const mark = check.ok ? "OK" : "WARN";
  console.log(`${mark} ${check.name}: ${check.detail}`);
}

if (!checks[0].ok || !hasAppPassword || !hasAuthSecret) {
  process.exitCode = 1;
}
