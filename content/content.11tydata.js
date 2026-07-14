const slugify = require("slugify");
const fs = require("fs");
const slugifyHeading = (s) =>
  slugify(s, { lower: true, strict: true, remove: /[*+~.()'"!?:@#$%^&={}\[\]<>]/g });

const rawCache = new Map();
function getRaw(data) {
  // Prefer the inline rawInput when present, otherwise read from disk.
  if (data.page && data.page.rawInput) return data.page.rawInput;
  const p = data.page && data.page.inputPath;
  if (!p) return "";
  if (rawCache.has(p)) return rawCache.get(p);
  try {
    const raw = fs.readFileSync(p, "utf8");
    rawCache.set(p, raw);
    return raw;
  } catch (e) {
    return "";
  }
}

function stripCodeBlocks(md) {
  return md.replace(/```[\s\S]*?```/g, "");
}

function countWords(md) {
  const text = stripCodeBlocks(md)
    .replace(/!?\[([^\]]*)\]\([^\)]+\)/g, "$1")
    .replace(/[#>*_`~|\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return 0;
  return text.split(" ").length;
}

function extractHeadings(md) {
  const out = [];
  const lines = stripCodeBlocks(md).split("\n");
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const title = m[2].replace(/`/g, "").trim();
    out.push({ level, title, slug: slugifyHeading(title) });
  }
  return out;
}

module.exports = {
  layout: "content.njk",
  eleventyComputed: {
    permalink: (data) => {
      const stem = data.page.filePathStem || "";
      const clean = stem
        .replace(/^\/content\//, "/")
        .replace(/\/index$/, "/");
      return clean + (clean.endsWith("/") ? "index.html" : "/index.html");
    },
    pageTitle: (data) => {
      const raw = getRaw(data);
      const m = raw.match(/^#\s+(.+)$/m);
      return m ? m[1].trim() : data.title || "";
    },
    description: (data) => {
      const raw = getRaw(data);
      const after = raw.replace(/^#\s+.+$/m, "");
      const para = after.split(/\n\n+/).map((p) => p.trim()).find((p) => p && !p.startsWith("#") && !p.startsWith("```"));
      if (!para) return "";
      const text = para.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1").replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
      // Target ~155 chars so Google's SERP snippet (≈160) doesn't truncate mid-sentence.
      if (text.length <= 155) return text;
      // Truncate at a word boundary when possible.
      const cut = text.slice(0, 155);
      const lastSpace = cut.lastIndexOf(" ");
      return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "") + "…";
    },
    wordCount: (data) => countWords(getRaw(data)),
    readingTime: (data) => {
      const words = countWords(getRaw(data));
      return Math.max(1, Math.round(words / 220));
    },
    toc: (data) => extractHeadings(getRaw(data))
  }
};
