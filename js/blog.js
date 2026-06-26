/* ExpatLawyerSpain — blog article behaviours (share button) */
(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-share]');
    if (!btn) return;
    var payload = { title: document.title, url: location.href };
    if (navigator.share) {
      navigator.share(payload).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(function () {
        var lbl = btn.querySelector('.share-label');
        if (lbl) {
          var original = lbl.textContent;
          lbl.textContent = 'Link copied';
          setTimeout(function () { lbl.textContent = original; }, 1800);
        } else {
          btn.classList.add('copied');
          setTimeout(function () { btn.classList.remove('copied'); }, 1800);
        }
      }).catch(function () {});
    }
  });
})();
