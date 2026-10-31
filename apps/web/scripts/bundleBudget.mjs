/**
 * Bundle-size budget for the web build (checked in CI after `vite build`).
 * Sizes are compared gzipped, the way browsers download them. Pure functions only:
 * scripts/check-bundle-size.mjs reads dist/ and prints the report.
 */

/** "babylon-loaders-AbC_12-x.js" → "babylon-loaders" (Vite appends an 8-character hash). */
export function chunkName(file) {
  const base = String(file).split('/').pop() ?? '';
  const match = /^(.*)-[A-Za-z0-9_-]{8}\.(?:js|css)$/.exec(base);
  return match ? match[1] : base.replace(/\.(?:js|css)$/, '');
}

const kb = bytes => bytes / 1024;
export const formatKB = bytes => `${kb(bytes).toFixed(1)} KB`;

/** Script URLs the first page preloads (`<script src>` and `<link rel=modulepreload>`), as chunk names. */
export function firstPageChunks(html) {
  const names = new Set();
  for (const match of String(html).matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.js)"[^>]*>/g)) names.add(chunkName(match[1]));
  return [...names];
}

/**
 * @param {{ js: { file: string, gzip: number }[], css?: { file: string, gzip: number }[], assets?: { file: string, bytes: number }[], html?: string }} build
 * @param {{ chunksKB: Record<string, number>, otherChunkKB: number, totalJsKB: number, cssKB?: number, largestAssetKB: number, firstPageMustNotLoad?: string[] }} budget
 */
export function checkBudget(build, budget) {
  const failures = [];
  const rows = [];
  for (const chunk of build.js) {
    const name = chunkName(chunk.file);
    const limitKB = budget.chunksKB[name] ?? budget.otherChunkKB;
    const ok = kb(chunk.gzip) <= limitKB;
    rows.push({ name, file: chunk.file, gzip: chunk.gzip, limitKB, ok });
    if (!ok) failures.push(`${name} is ${formatKB(chunk.gzip)} gzipped, over its ${limitKB} KB budget`);
  }
  rows.sort((a, b) => b.gzip - a.gzip);
  const totalJs = build.js.reduce((sum, chunk) => sum + chunk.gzip, 0);
  if (kb(totalJs) > budget.totalJsKB) failures.push(`all JavaScript is ${formatKB(totalJs)} gzipped, over the ${budget.totalJsKB} KB budget`);
  const totalCss = (build.css ?? []).reduce((sum, file) => sum + file.gzip, 0);
  if (budget.cssKB !== undefined && kb(totalCss) > budget.cssKB) failures.push(`CSS is ${formatKB(totalCss)} gzipped, over the ${budget.cssKB} KB budget`);
  const largest = [...(build.assets ?? [])].sort((a, b) => b.bytes - a.bytes)[0] ?? null;
  if (largest && kb(largest.bytes) > budget.largestAssetKB) {
    failures.push(`${largest.file} is ${formatKB(largest.bytes)}, over the ${budget.largestAssetKB} KB per-asset budget (compress it)`);
  }
  const firstPage = build.html === undefined ? [] : firstPageChunks(build.html);
  for (const name of budget.firstPageMustNotLoad ?? []) {
    if (firstPage.includes(name)) failures.push(`the start page preloads "${name}"; it should load only when the 3D world opens`);
  }
  return { ok: failures.length === 0, failures, rows, totalJs, totalCss, largest, firstPage };
}
