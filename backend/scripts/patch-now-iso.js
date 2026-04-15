/**
 * One-shot: add `require("../utils/date")` depth-aware and replace `new Date().toISOString()` → `nowISOString()`.
 * Run: node scripts/patch-now-iso.js
 */
const fs = require("fs");
const path = require("path");

const srcRoot = path.join(__dirname, "../src");

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith(".js")) files.push(p);
  }
  return files;
}

for (const file of walk(srcRoot)) {
  if (file.replace(/\\/g, "/").endsWith("/utils/date.js")) continue;
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("new Date().toISOString()")) continue;

  const rel = path.relative(path.dirname(file), path.join(srcRoot, "utils/date.js")).replace(/\\/g, "/");
  const reqPath = rel.startsWith(".") ? rel : `./${rel}`;
  const reqLine = `const { nowISOString } = require("${reqPath}");\n`;

  if (!s.includes("/utils/date") && !s.includes("\\utils\\date")) {
    const m = s.match(/^(\s*\/\/[^\n]*\n)*/);
    const insertAt = m ? m[0].length : 0;
    s = s.slice(0, insertAt) + reqLine + s.slice(insertAt);
  } else if (!s.includes("nowISOString")) {
    const m = s.match(/^(\s*\/\/[^\n]*\n)*/);
    const insertAt = m ? m[0].length : 0;
    s = s.slice(0, insertAt) + reqLine + s.slice(insertAt);
  }

  s = s.replace(/\bnew Date\(\)\.toISOString\(\)/g, "nowISOString()");
  fs.writeFileSync(file, s);
}

console.log("patch-now-iso: done");
