// Scale42 language detection + persistence.
// Runs early to redirect Norwegian visitors to /no/ on first visit.
// Respects an explicit user choice stored in localStorage.
(function () {
  var KEY = 's42-lang';
  var path = location.pathname;
  var onNo = path.indexOf('/no/') === 0 || path === '/no' || path.indexOf('/no/') !== -1;

  // Click handlers on EN/NO toggle: persist choice.
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-lang]');
    if (!t) return;
    try { localStorage.setItem(KEY, t.dataset.lang); } catch (_) {}
  });

  // Auto-redirect on first visit only.
  var saved;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  if (saved) return; // user has chosen — don't override.

  var lang = (navigator.language || navigator.userLanguage || '').toLowerCase();
  var prefersNo = /^(nb|nn|no)\b/.test(lang);

  if (prefersNo && !onNo) {
    // Redirect to /no/ equivalent.
    var target = '/no/';
    if (path.indexOf('datacenters.html') !== -1) target = '/datacenters.html'; // kept EN until /no/datacenters.html exists
    if (path.indexOf('brand.html') !== -1)        target = '/brand.html';
    location.replace(target + (location.hash || ''));
  } else if (!prefersNo && onNo) {
    // Norwegian path but English-preferring browser — leave it; user came here intentionally.
  }
})();
