// Scale42 CMS overlay — wires inline edits to /api/cms/section.
(function () {
  function setState(el, attr) {
    ["saving", "saved", "error"].forEach((s) => el.removeAttribute("data-" + s));
    if (attr) el.setAttribute("data-" + attr, "1");
  }

  function fadeAck(el) {
    setState(el, "saved");
    setTimeout(() => setState(el, null), 1200);
  }

  function save(el) {
    const value = el.innerText;
    if (el.dataset.last === value) return;
    el.dataset.last = value;
    setState(el, "saving");

    // Row mode: <span data-cms-table data-cms-id data-cms-field>
    const table = el.getAttribute("data-cms-table");
    const id = el.getAttribute("data-cms-id");
    const field = el.getAttribute("data-cms-field");
    // Section mode: <span data-cms-page data-cms-key>
    const page = el.getAttribute("data-cms-page");
    const key = el.getAttribute("data-cms-key");

    const isRow = table && id && field;
    const url = isRow ? "/api/cms/row" : "/api/cms/section";
    const payload = isRow ? { table, id, field, value } : { page, key, value };

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((r) => {
        if (!r.ok) return Promise.reject(r);
        fadeAck(el);
      })
      .catch(() => setState(el, "error"));
  }

  function attach() {
    document.querySelectorAll(".s42-edit[contenteditable='true']").forEach((el) => {
      el.dataset.last = el.innerText;
      el.addEventListener("blur", () => save(el));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          el.blur();
        }
        if (e.key === "Escape") {
          el.innerText = el.dataset.last || "";
          el.blur();
        }
      });
    });
  }

  function toolbar() {
    const t = document.getElementById("s42-cms-toolbar");
    if (!t) return;
    t.innerHTML = `
      <span class="badge">CMS</span>
      <a href="/cms/nav">Menu</a>
      <a href="/cms/sites">Sites</a>
      <a href="/cms/news">News</a>
      <a href="/cms/people">People</a>
      <a href="/cms/developers">Partners</a>
      <a href="/cms/journey">Journey</a>
      <button class="publish" id="s42-publish">Publish →</button>
    `;
    t.querySelector("#s42-publish").addEventListener("click", async () => {
      const btn = t.querySelector("#s42-publish");
      btn.textContent = "Publishing…";
      try {
        const r = await fetch("/api/publish", { method: "POST" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || r.statusText);
        btn.textContent = "Published ✓";
        setTimeout(() => (btn.textContent = "Publish →"), 2500);
      } catch (e) {
        alert("Publish failed: " + e.message);
        btn.textContent = "Publish →";
      }
    });
  }

  function init() {
    attach();
    toolbar();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
