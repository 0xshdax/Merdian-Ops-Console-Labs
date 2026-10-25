'use strict';

(function () {
  function paint(host) {
    if (!host) return;
    var params = new URLSearchParams(window.location.search);
    var term = params.get('q');
    var status = params.get('status');
    var region = params.get('region');
    if (!term && !status && !region) {
      host.hidden = true;
      host.textContent = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = '<span class="qb-k">View</span>'
      + (status ? '<em>' + status + '</em>' : '')
      + (region ? '<em>' + region + '</em>' : '')
      + (term ? '<strong>' + term + '</strong>' : '');
  }

  window.MeridianQuery = { paint: paint };
})();
