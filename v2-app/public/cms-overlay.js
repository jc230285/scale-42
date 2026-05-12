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
    const page = el.getAttribute("data-cms-page");
    const key = el.getAttribute("data-cms-key");
    const value = el.innerText;
    if (el.dataset.last === value) return;
    el.dataset.last = value;
    setState(el, "saving");
    fetch("/api/cms/section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, key, value }),
    })
      .then((r) => {
        if (!r.ok) return Promise.reject(r);
        fadeAck(el);
        scheduleAutoPublish();
      })
      .catch(() => setState(el, "error"));
  }

  // Auto-publish: debounce a /api/publish/maybe call ~5s after the latest edit.
  // The server honours a 10-min throttle, so call cost is cheap.
  let autoPubTimer = null;
  function scheduleAutoPublish() {
    if (autoPubTimer) clearTimeout(autoPubTimer);
    autoPubTimer = setTimeout(() => {
      fetch("/api/publish/maybe", { method: "POST" }).catch(() => {});
    }, 5000);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      attach();
      toolbar();
    });
  } else {
    attach();
    toolbar();
  }
})();
