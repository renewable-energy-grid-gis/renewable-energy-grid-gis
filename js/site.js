/* Renewable Energy & Grid GIS — client behaviors
   - Mobile nav toggle
   - Copy-to-clipboard buttons on code blocks
   - Task-list checkbox toggling + line-through state
   - FAQ accordion conversion (when an H2 contains "FAQ" or "Frequently Asked Questions")
   - Lazy Mermaid loader when a .mermaid block is present
   - Footer year
   - Service worker registration
*/
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    initMobileNav();
    initCopyButtons();
    initTaskLists();
    initFaqAccordions();
    initTocToggle();
    initMermaid();
    setFooterYear();
    registerServiceWorker();
  });

  function initTocToggle() {
    var btn = document.querySelector(".article-meta__toc-toggle");
    var toc = document.getElementById("article-toc");
    if (!toc) return;
    var wideMQ = window.matchMedia("(min-width: 1200px)");
    function applyWide() {
      if (wideMQ.matches) {
        toc.hidden = false;
        if (btn) btn.setAttribute("aria-expanded", "true");
      } else if (btn) {
        // Restore the toggle's last user-driven state on narrow screens — start collapsed.
        toc.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    }
    applyWide();
    if (wideMQ.addEventListener) wideMQ.addEventListener("change", applyWide);
    else wideMQ.addListener(applyWide); // legacy Safari
    if (btn) {
      btn.addEventListener("click", function () {
        var open = toc.hidden;
        toc.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    toc.addEventListener("click", function (e) {
      var a = e.target.closest("a[href^='#']");
      if (a && !wideMQ.matches && btn) {
        setTimeout(function () { toc.hidden = true; btn.setAttribute("aria-expanded", "false"); }, 150);
      }
    });
  }

  function initMobileNav() {
    var btn = document.querySelector(".site-header__toggle");
    var nav = document.getElementById("primary-nav");
    if (!btn || !nav) return;
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) nav.classList.remove("is-open");
    });
  }

  function initCopyButtons() {
    document.querySelectorAll(".code-block__copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var fig = btn.closest(".code-block");
        var code = fig && fig.querySelector("pre code");
        if (!code) return;
        var text = code.innerText;
        var done = function () {
          var prev = btn.textContent;
          btn.classList.add("is-copied");
          btn.textContent = "Copied";
          setTimeout(function () {
            btn.classList.remove("is-copied");
            btn.textContent = prev || "Copy";
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(fallback);
        } else {
          fallback();
        }
        function fallback() {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); done(); } catch (e) { /* noop */ }
          document.body.removeChild(ta);
        }
      });
    });
  }

  function initTaskLists() {
    var items = document.querySelectorAll("li.task-list-item");
    if (!items.length) return;
    var storageKey = "tasks:" + location.pathname;
    var stored;
    try { stored = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch (e) { stored = {}; }

    items.forEach(function (li, idx) {
      var cb = li.querySelector('input[type="checkbox"]');
      if (!cb) return;
      cb.disabled = false;
      cb.removeAttribute("disabled");
      var key = String(idx);
      if (stored[key]) { cb.checked = true; li.classList.add("is-done"); }
      cb.addEventListener("change", function () {
        if (cb.checked) li.classList.add("is-done");
        else li.classList.remove("is-done");
        stored[key] = cb.checked;
        try { localStorage.setItem(storageKey, JSON.stringify(stored)); } catch (e) { /* quota */ }
      });
    });
  }

  function initFaqAccordions() {
    // Find an <h2> whose text contains "FAQ" or "Frequently Asked Questions".
    // Everything from the next <h3> through subsequent siblings becomes a <details>/<summary> until
    // the next <h2> or end of section.
    var heads = Array.prototype.slice.call(document.querySelectorAll(".prose h2"));
    heads.forEach(function (h2) {
      var txt = (h2.textContent || "").toLowerCase();
      if (!/faq|frequently asked questions/.test(txt)) return;
      var faqList = document.createElement("div");
      faqList.className = "faq-list";
      var node = h2.nextElementSibling;
      var current = null;
      var toRemove = [];
      while (node && node.tagName !== "H2") {
        var next = node.nextElementSibling;
        if (node.tagName === "H3") {
          current = document.createElement("details");
          var summary = document.createElement("summary");
          // Strip header anchor link from question text if present
          var question = node.cloneNode(true);
          var anchor = question.querySelector(".heading-anchor");
          if (anchor) anchor.remove();
          summary.textContent = question.textContent.trim();
          current.appendChild(summary);
          var body = document.createElement("div");
          body.className = "faq-body";
          current.appendChild(body);
          faqList.appendChild(current);
        } else if (current) {
          var body2 = current.querySelector(".faq-body");
          body2.appendChild(node.cloneNode(true));
        }
        toRemove.push(node);
        node = next;
      }
      if (faqList.children.length) {
        h2.parentNode.insertBefore(faqList, h2.nextSibling ? h2.nextSibling : null);
        // Move the accordion before original siblings, then remove them.
        h2.parentNode.insertBefore(faqList, node);
        toRemove.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      }
    });
  }

  function initMermaid() {
    var blocks = document.querySelectorAll(".mermaid");
    if (!blocks.length) return;
    var s = document.createElement("script");
    s.src = "/js/mermaid.min.js";
    s.onload = function () {
      if (!window.mermaid) return;
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          primaryColor: "#DCEEF6",
          primaryTextColor: "#1F3A60",
          primaryBorderColor: "#5BA8C8",
          lineColor: "#345B8B",
          secondaryColor: "#DDF0E2",
          tertiaryColor: "#FFE3BE",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        },
        flowchart: { curve: "basis" },
        securityLevel: "strict"
      });
      window.mermaid.run({ querySelector: ".mermaid" });
    };
    document.head.appendChild(s);
  }

  function setFooterYear() {
    var el = document.getElementById("footer-year");
    if (el) el.textContent = new Date().getFullYear();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function (err) {
        console.warn("SW registration failed:", err);
      });
    });
  }
})();
