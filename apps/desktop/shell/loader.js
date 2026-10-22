/* global window, document */
// The app's own first page: it opens Tudu on the web (the address the app gives it in window.__TUDU_WEB__) when the
// site answers, and says you are offline when it does not, trying again once you are back.
(function () {
  var web = String(window.__TUDU_WEB__ || '').replace(/\/$/, '');
  var path = document.documentElement.getAttribute('data-go') || '/';
  var page = document.getElementById('offline');
  var again = document.getElementById('again');
  var busy = false;

  function go() {
    if (busy || !web) return;
    busy = true;
    again.setAttribute('aria-busy', 'true');
    fetch(web + '/', { mode: 'no-cors', cache: 'no-store' })
      .then(function () {
        window.location.replace(web + path);
      })
      .catch(function () {
        busy = false;
        again.removeAttribute('aria-busy');
        page.hidden = false;
      });
  }
  again.addEventListener('click', go);
  window.addEventListener('online', go);
  setInterval(function () {
    if (!page.hidden) go();
  }, 30000);
  go();
})();
