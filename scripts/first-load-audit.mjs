import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const repoRoot = process.cwd();
const nextDir = path.join(repoRoot, ".next");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function extractRscManifestJson(jsFilePath, routeKey) {
  const raw = fs.readFileSync(jsFilePath, "utf8");
  const needle = `globalThis.__RSC_MANIFEST["${routeKey}"] = `;
  const start = raw.indexOf(needle);
  if (start === -1) throw new Error(`Could not find routeKey ${routeKey} in ${jsFilePath}`);
  const jsonStart = start + needle.length;
  const jsonText = raw.slice(jsonStart).trim();
  return JSON.parse(jsonText);
}

function normalizeChunkPath(p) {
  if (p.startsWith("/_next/")) return p.slice("/_next/".length);
  if (p.startsWith("_next/")) return p.slice("_next/".length);
  return p.replace(/^\/+/, "");
}

function statFileBytes(rel) {
  const abs = path.join(nextDir, rel);
  const buf = fs.readFileSync(abs);
  return {
    bytes: buf.length,
    gzipBytes: zlib.gzipSync(buf).length,
  };
}

function sumUniqueFiles(fileList) {
  const uniq = [...new Set(fileList.map(normalizeChunkPath))].filter(Boolean);
  let bytes = 0;
  let gzipBytes = 0;
  const missing = [];
  for (const rel of uniq) {
    try {
      const s = statFileBytes(rel);
      bytes += s.bytes;
      gzipBytes += s.gzipBytes;
    } catch {
      missing.push(rel);
    }
  }
  return { uniq, bytes, gzipBytes, missing };
}

const buildManifest = readJson(path.join(nextDir, "build-manifest.json"));
const baseFiles = [
  ...(buildManifest.polyfillFiles ?? []),
  ...(buildManifest.rootMainFiles ?? []),
].map(normalizeChunkPath);

const routes = [
  { route: "/", routeKey: "/page", entryHint: "/src/app/page" },
  { route: "/land", routeKey: "/land/page", entryHint: "/src/app/land/page" },
  { route: "/kommune", routeKey: "/kommune/page", entryHint: "/src/app/kommune/page" },
  { route: "/kommune/[slug]", routeKey: "/kommune/[slug]/page", entryHint: "/src/app/kommune/[slug]/page" },
  { route: "/beskyttelsesrum/[slug]", routeKey: "/beskyttelsesrum/[slug]/page", entryHint: "/src/app/beskyttelsesrum/[slug]/page" },
  { route: "/om-data", routeKey: "/om-data/page", entryHint: "/src/app/om-data/page" },
  { route: "/kort", routeKey: "/kort/page", entryHint: "/src/app/kort/page" },
  { route: "/shelters/nearby", routeKey: "/shelters/nearby/page", entryHint: "/src/app/shelters/nearby/page" },
  { route: "/tell-me-more", routeKey: "/tell-me-more/page", entryHint: "/src/app/tell-me-more/page" },
];

const rows = [];
for (const r of routes) {
  const manifestJsPath = path.join(nextDir, "server", "app", r.routeKey.replace(/^\//, "") + "_client-reference-manifest.js");
  const m = extractRscManifestJson(manifestJsPath, r.routeKey);
  const entryJSFiles = m.entryJSFiles ?? {};

  const layoutKey = Object.keys(entryJSFiles).find((k) => k.endsWith("/src/app/layout")) ?? "[project]/src/app/layout";
  const pageKey = Object.keys(entryJSFiles).find((k) => k.includes(r.entryHint));
  if (!pageKey) throw new Error(`Could not find entryJSFiles key containing ${r.entryHint} for ${r.route}`);

  const files = [
    ...baseFiles,
    ...(entryJSFiles[layoutKey] ?? []),
    ...(entryJSFiles[pageKey] ?? []),
  ].map(normalizeChunkPath);

  const summed = sumUniqueFiles(files);
  rows.push({
    route: r.route,
    filesCount: summed.uniq.length,
    bytes: summed.bytes,
    gzipBytes: summed.gzipBytes,
    missing: summed.missing,
  });
}

function fmtKB(n) {
  return `${(n / 1024).toFixed(1)} kB`;
}

console.log("First-load JS estimate (base + layout + page entry chunks)");
console.log("");
for (const row of rows) {
  console.log(
    `${row.route.padEnd(20)}  raw ${fmtKB(row.bytes).padStart(10)}  gzip ${fmtKB(row.gzipBytes).padStart(10)}  (${row.filesCount} files)`,
  );
  if (row.missing.length) {
    console.log(`  ⚠ missing files: ${row.missing.slice(0, 5).join(", ")}${row.missing.length > 5 ? "…" : ""}`);
  }
}

