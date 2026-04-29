// Scale42 language detection + persistence.
// Runs early to redirect Norwegian visitors to /no/ on first visit.
// Respects an explicit user choice stored in localStorage.
(function () {
  var KEY = 's42-lang';
  var path = location.pathname;
  var onNo = path.indexOf('/no/') === 0 || path.indexOf('/no/') !== -1;

  // Map every EN page to its NO counterpart.
  var EN_TO_NO = {
    '/':    '/no/',
    '/index.html':    '/no/index.html',
    '/capabilities/':    '/no/capabilities/',
    '/careers/':    '/no/careers/',
    '/datacenters/':    '/no/datacenters/',
    '/datacenters/glomfjord/':    '/no/datacenters/glomfjord/',
    '/datacenters/bakki/':    '/no/datacenters/bakki/',
    '/datacenters/varkaus/':    '/no/datacenters/varkaus/',
    '/news/':    '/no/news/',
    '/press/':    '/no/press/'
  };

  // Click handlers on the EN/NO toggle: persist choice.
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
    var target = EN_TO_NO[path];
    if (target && target !== path) {
      location.replace(target + (location.hash || ''));
    }
  }
})();
