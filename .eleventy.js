const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItAttrs = require("markdown-it-attrs");
const markdownItFootnote = require("markdown-it-footnote");
const markdownItTaskLists = require("markdown-it-task-lists");
const Prism = require("prismjs");
const loadLanguages = require("prismjs/components/");
const katex = require("katex");
const slugify = require("slugify");
const fs = require("fs");

loadLanguages(["python", "bash", "json", "yaml", "javascript", "shell", "toml", "ini"]);

// --- KaTeX renderer (inline + display) -------------------------------------
function renderKatex(src, displayMode) {
  try {
    return katex.renderToString(src, {
      throwOnError: false,
      displayMode,
      output: "html",
      strict: "ignore"
    });
  } catch (err) {
    return `<code>${src}</code>`;
  }
}

// markdown-it plugin: $$…$$ block math and $…$ inline math
function mathPlugin(md) {
  md.inline.ruler.after("escape", "math_inline", (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false;
    if (state.src.charCodeAt(start + 1) === 0x24) return false;
    const end = state.src.indexOf("$", start + 1);
    if (end === -1) return false;
    const content = state.src.slice(start + 1, end);
    if (!content.trim()) return false;
    if (/^\s|\s$/.test(content)) return false;
    if (!silent) {
      const token = state.push("math_inline", "span", 0);
      token.markup = "$";
      token.content = content;
    }
    state.pos = end + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) =>
    `<span class="math math-inline">${renderKatex(tokens[idx].content, false)}</span>`;

  md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const maxPos = state.eMarks[startLine];
    const line = state.src.slice(startPos, maxPos).trim();
    if (!line.startsWith("$$")) return false;
    let nextLine = startLine;
    let content = "";
    if (line.length >= 4 && line.endsWith("$$")) {
      content = line.slice(2, -2).trim();
    } else {
      let found = false;
      const inner = [line.slice(2)];
      for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
        const lp = state.bMarks[nextLine] + state.tShift[nextLine];
        const lm = state.eMarks[nextLine];
        const txt = state.src.slice(lp, lm);
        if (txt.trim().endsWith("$$")) {
          inner.push(txt.replace(/\$\$\s*$/, ""));
          found = true;
          break;
        }
        inner.push(txt);
      }
      if (!found) return false;
      content = inner.join("\n").trim();
    }
    if (silent) return true;
    state.line = nextLine + 1;
    const token = state.push("math_block", "div", 0);
    token.block = true;
    token.markup = "$$";
    token.content = content;
    return true;
  }, { alt: [] });

  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math math-block">${renderKatex(tokens[idx].content, true)}</div>\n`;
}

// --- Heading slugger -------------------------------------------------------
const slugifyFn = (s) =>
  slugify(s, { lower: true, strict: true, remove: /[*+~.()'"!?:@#$%^&={}\[\]<>]/g });

// --- Markdown-it instance --------------------------------------------------
const md = markdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, lang) {
    const useLang = (lang || "").toLowerCase();
    if (useLang === "mermaid") {
      return `<div class="mermaid">${md.utils.escapeHtml(code)}</div>`;
    }
    let html;
    if (useLang && Prism.languages[useLang]) {
      html = Prism.highlight(code, Prism.languages[useLang], useLang);
    } else {
      html = md.utils.escapeHtml(code);
    }
    const label = useLang || "text";
    return `<figure class="code-block" data-lang="${label}">
<figcaption class="code-block__head"><span class="code-block__lang">${label}</span><button type="button" class="code-block__copy" aria-label="Copy code">Copy</button></figcaption>
<pre class="language-${useLang || "text"}" tabindex="0"><code class="language-${useLang || "text"}">${html}</code></pre>
</figure>`;
  }
})
  .use(markdownItAnchor, {
    slugify: slugifyFn,
    permalink: markdownItAnchor.permalink.linkInsideHeader({
      symbol: '<span aria-hidden="true">#</span>',
      placement: "after",
      class: "heading-anchor",
      renderAttrs: (slug) => ({ "aria-label": `Permalink to this section` })
    })
  })
  .use(markdownItAttrs)
  .use(markdownItFootnote)
  .use(markdownItTaskLists, { enabled: true, label: false, lineNumber: false })
  .use(mathPlugin);

// Replace the default fence renderer so our highlight HTML is emitted as-is
// (the default wraps non-<pre>-prefixed output in <pre><code>).
md.renderer.rules.fence = function (tokens, idx, options, env, slf) {
  const token = tokens[idx];
  const info = token.info ? md.utils.unescapeAll(token.info).trim() : "";
  const langName = info.split(/\s+/g)[0] || "";
  const highlighted = options.highlight
    ? options.highlight(token.content, langName, "")
    : md.utils.escapeHtml(token.content);
  return highlighted + "\n";
};

// Wrap tables for horizontal scroll.
const defaultTableOpen = md.renderer.rules.table_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
const defaultTableClose = md.renderer.rules.table_close || ((t, i, o, e, s) => s.renderToken(t, i, o));
md.renderer.rules.table_open = function (tokens, idx, opts, env, self) {
  return '<div class="table-wrap">' + defaultTableOpen(tokens, idx, opts, env, self);
};
md.renderer.rules.table_close = function (tokens, idx, opts, env, self) {
  return defaultTableClose(tokens, idx, opts, env, self) + '</div>';
};

// --- Helpers ---------------------------------------------------------------
function titleize(slug) {
  const small = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "with"]);
  return slug
    .split("-")
    .map((w, i) => {
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function urlToBreadcrumbs(url, collection, titleResolver) {
  if (!url || url === "/") return [{ title: "Home", url: "/" }];
  const parts = url.split("/").filter(Boolean);
  const crumbs = [{ title: "Home", url: "/" }];
  let acc = "";
  for (const seg of parts) {
    acc += "/" + seg;
    const fullUrl = acc + "/";
    let title = null;
    if (titleResolver) title = titleResolver(fullUrl);
    if (!title) {
      const hit = collection && collection.find((p) => p.url === fullUrl);
      title = (hit && hit.data && hit.data.pageTitle) || titleize(seg);
    }
    crumbs.push({ title, url: fullUrl });
  }
  return crumbs;
}

// --- Eleventy config -------------------------------------------------------
module.exports = function (eleventyConfig) {
  eleventyConfig.setLibrary("md", md);

  // Pass-through assets
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("manifest.webmanifest");
  eleventyConfig.addPassthroughCopy("sw.js");
  eleventyConfig.addPassthroughCopy("robots.txt");
  // Serve a root /favicon.ico so browser default requests (pages without
  // <link rel="icon">) resolve with 200 instead of a 404 console error.
  eleventyConfig.addPassthroughCopy({ "assets/icons/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy("05955990368728d084997696e2b7bbaa.txt");

  // KaTeX stylesheet + fonts
  eleventyConfig.addPassthroughCopy({
    "node_modules/katex/dist/katex.min.css": "css/katex.min.css"
  });
  eleventyConfig.addPassthroughCopy({
    "node_modules/katex/dist/fonts": "css/fonts"
  });

  // Mermaid bundle (lazy-loaded on pages that contain .mermaid blocks)
  eleventyConfig.addPassthroughCopy({
    "node_modules/mermaid/dist/mermaid.min.js": "js/mermaid.min.js"
  });

  eleventyConfig.addWatchTarget("css/");
  eleventyConfig.addWatchTarget("js/");
  eleventyConfig.addWatchTarget("content/");

  // --- Filters -------------------------------------------------------------

  // htmlLen: compute the byte length of a string after HTML-escaping
  // (& → &amp; adds 4, < → &lt; adds 3, > → &gt; adds 3, " → &quot; adds 5)
  eleventyConfig.addFilter("htmlLen", function (str) {
    if (!str) return 0;
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .length;
  });

  eleventyConfig.addFilter("titleize", titleize);

  eleventyConfig.addFilter("breadcrumbs", function (url) {
    const all = (this.ctx && this.ctx.collections && this.ctx.collections.all) || [];
    const resolve = (u) => {
      // Reuse the cached titleFor logic.
      const hit = all.find((p) => p.url === u);
      if (!hit) return null;
      if (hit.data && (hit.data.pageTitle || hit.data.title)) return hit.data.pageTitle || hit.data.title;
      if (hit.inputPath) {
        try {
          const raw = fs.readFileSync(hit.inputPath, "utf8");
          const m = raw.match(/^#\s+(.+)$/m);
          if (m) return m[1].trim();
        } catch (e) { /* */ }
      }
      return null;
    };
    return urlToBreadcrumbs(url, all, resolve);
  });

  // Pull first H1 from raw markdown content (used by parent index to label children)
  eleventyConfig.addFilter("firstHeading", (content) => {
    if (!content) return "";
    const m = String(content).match(/^#\s+(.+)$/m);
    return m ? m[1].trim() : "";
  });

  // Direct children of a base url (one path-segment deeper)
  eleventyConfig.addFilter("children", function (all, baseUrl) {
    const depth = baseUrl.split("/").filter(Boolean).length;
    return all
      .filter((p) => {
        if (!p.url || !p.url.startsWith(baseUrl) || p.url === baseUrl) return false;
        return p.url.split("/").filter(Boolean).length === depth + 1;
      })
      .sort((a, b) => a.url.localeCompare(b.url));
  });

  // Descendants (any depth below)
  eleventyConfig.addFilter("descendants", function (all, baseUrl) {
    return all
      .filter((p) => p.url && p.url !== baseUrl && p.url.startsWith(baseUrl))
      .sort((a, b) => a.url.localeCompare(b.url));
  });

  // Siblings (same parent path)
  eleventyConfig.addFilter("siblings", function (all, currentUrl) {
    if (!currentUrl || currentUrl === "/") return [];
    const segments = currentUrl.split("/").filter(Boolean);
    const parent = "/" + segments.slice(0, -1).join("/") + (segments.length > 1 ? "/" : "");
    const depth = segments.length;
    return all
      .filter((p) => {
        if (!p.url || p.url === currentUrl || !p.url.startsWith(parent)) return false;
        return p.url.split("/").filter(Boolean).length === depth;
      })
      .sort((a, b) => a.url.localeCompare(b.url));
  });

  eleventyConfig.addFilter("parentUrl", function (url) {
    if (!url || url === "/") return "/";
    const segs = url.split("/").filter(Boolean);
    if (segs.length <= 1) return "/";
    return "/" + segs.slice(0, -1).join("/") + "/";
  });

  const titleCache = new Map();
  eleventyConfig.addFilter("titleFor", function (all, url) {
    if (titleCache.has(url)) return titleCache.get(url);
    const hit = all.find((p) => p.url === url);
    let title;
    if (hit) {
      if (hit.data.pageTitle) title = hit.data.pageTitle;
      else if (hit.data.title) title = hit.data.title;
      else if (hit.inputPath) {
        try {
          const raw = fs.readFileSync(hit.inputPath, "utf8");
          const m = raw.match(/^#\s+(.+)$/m);
          if (m) title = m[1].trim();
        } catch (e) { /* fall through */ }
      }
    }
    if (!title) title = titleize((url || "/").split("/").filter(Boolean).pop() || "Home");
    titleCache.set(url, title);
    return title;
  });

  // --- Collections ---------------------------------------------------------
  // Top-level section indexes (one segment deep, e.g. /core-energy-gis-data-spatial-fundamentals/)
  eleventyConfig.addCollection("sections", function (api) {
    return api
      .getAll()
      .filter((item) => /^\/[^\/]+\/$/.test(item.url || "") && item.url !== "/")
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0) || a.url.localeCompare(b.url));
  });

  return {
    dir: {
      input: ".",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html", "11ty.js"]
  };
};
