/**
 * Content-hash cache-busting for first-party (and local precached vendor) assets.
 *
 * Each entry sha1-hashes the SOURCE file (10-char slice) so its ?v= query
 * string changes whenever the file content changes. This lets the service
 * worker's stale-while-revalidate treat a new deploy as a brand-new URL and
 * fetch fresh CSS/JS instead of serving stale styling.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname + "/..";

// Resolve @import "..." partials (relative to the parent file) and append their
// contents so a change to any imported partial also busts the parent's hash.
function readWithImports(absPath, seen) {
  seen = seen || new Set();
  if (seen.has(absPath)) return "";
  seen.add(absPath);

  let css;
  try {
    css = fs.readFileSync(absPath, "utf8");
  } catch (e) {
    return "";
  }

  let combined = css;
  const importRe = /@import\s+(?:url\()?["']([^"')]+)["']\)?\s*;/g;
  let m;
  while ((m = importRe.exec(css)) !== null) {
    const spec = m[1];
    // Skip remote imports (http(s):// or //cdn...).
    if (/^(https?:)?\/\//.test(spec)) continue;
    const importedPath = path.resolve(path.dirname(absPath), spec);
    combined += "\n" + readWithImports(importedPath, seen);
  }
  return combined;
}

function hash(relPath) {
  const abs = path.resolve(ROOT, relPath);
  const content = /\.css$/.test(abs)
    ? readWithImports(abs)
    : (() => {
        try {
          return fs.readFileSync(abs, "utf8");
        } catch (e) {
          return "";
        }
      })();
  return crypto.createHash("sha1").update(content).digest("hex").slice(0, 10);
}

module.exports = {
  // First-party
  mainCss: hash("css/main.css"),
  siteJs: hash("js/site.js"),
  // Local precached vendor (served from /css/katex.min.css)
  katexCss: hash("node_modules/katex/dist/katex.min.css"),
};
