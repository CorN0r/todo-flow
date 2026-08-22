import fs from 'fs';

const html = fs.readFileSync('dist/stats.html', 'utf8');
const m = html.match(/const data = ([\s\S]*?);\s*const run/);
if (!m) {
  console.error('无法从 dist/stats.html 解析打包数据');
  process.exit(1);
}
const data = JSON.parse(m[1]);

const nodeParts = data.nodeParts;
const nodeMetas = data.nodeMetas;

// 用户关心入口 chunk：通常是 assets/index-*.js
const entryChunk = Object.keys(data.tree?.children?.[0]?.moduleParts || {})[0]
  || Object.keys(nodeParts).find((uid) => nodeParts[uid].metaUid && nodeMetas[nodeParts[uid].metaUid]?.id?.includes('assets/index-'))
  || 'assets/index-Dp1809dm.js';

function getChunkName(meta) {
  return Object.keys(meta.moduleParts || {})[0] || 'unknown';
}

const pkgs = {};
const chunkSizes = {};

for (const uid in nodeMetas) {
  const meta = nodeMetas[uid];
  const chunkName = getChunkName(meta);
  const partUid = meta.moduleParts?.[chunkName];
  if (!partUid || !nodeParts[partUid]) continue;

  const part = nodeParts[partUid];
  const id = meta.id || '';

  // 累计每个 chunk 的体积
  if (!chunkSizes[chunkName]) {
    chunkSizes[chunkName] = { parsed: 0, gzip: 0, brotli: 0 };
  }
  chunkSizes[chunkName].parsed += part.renderedLength || 0;
  chunkSizes[chunkName].gzip += part.gzipLength || 0;
  chunkSizes[chunkName].brotli += part.brotliLength || 0;

  // 按 npm 包聚合
  const nmIndex = id.indexOf('node_modules/');
  if (nmIndex === -1) continue;
  const afterNm = id.slice(nmIndex + 'node_modules/'.length);
  const parts = afterNm.split('/');
  // scoped packages: @scope/name
  const pkgName = afterNm.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  if (!pkgName) continue;

  if (!pkgs[chunkName]) pkgs[chunkName] = {};
  if (!pkgs[chunkName][pkgName]) {
    pkgs[chunkName][pkgName] = { parsed: 0, gzip: 0, brotli: 0 };
  }
  pkgs[chunkName][pkgName].parsed += part.renderedLength || 0;
  pkgs[chunkName][pkgName].gzip += part.gzipLength || 0;
  pkgs[chunkName][pkgName].brotli += part.brotliLength || 0;
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`.padStart(10);
}

function reportChunk(name) {
  const size = chunkSizes[name];
  if (!size) return;
  console.log(`\n${name}`);
  console.log(`  parsed: ${formatSize(size.parsed)} | gzip: ${formatSize(size.gzip)} | brotli: ${formatSize(size.brotli)}`);

  const pkgMap = pkgs[name];
  if (!pkgMap) return;
  const sorted = Object.entries(pkgMap).sort((a, b) => b[1].parsed - a[1].parsed).slice(0, 20);
  sorted.forEach(([pkg, s]) => {
    console.log(
      `  ${pkg.padEnd(32)} parsed:${formatSize(s.parsed)} gzip:${formatSize(s.gzip)}`
    );
  });
}

// 报告所有 chunk（按 parsed 降序）
const chunks = Object.entries(chunkSizes).sort((a, b) => b[1].parsed - a[1].parsed);
chunks.forEach(([name]) => reportChunk(name));

// 入口 chunk 的 Top 20 包
const entryName = chunks.find(([name]) => name.startsWith('assets/index-'))?.[0];
if (entryName) {
  console.log(`\n=== 入口 chunk 详情: ${entryName} ===`);
  reportChunk(entryName);
}
