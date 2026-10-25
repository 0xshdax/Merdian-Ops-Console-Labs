'use strict';

(function () {
  function countUp(el, target, format) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !isFinite(target)) {
      el.textContent = format(target);
      return;
    }
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / 720);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(target * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function tile(label, id, sub) {
    return '<article class="tile"><div class="tile-head"><span class="k">' + label + '</span></div>'
      + '<div class="v" id="' + id + '">—</div><div class="sub">' + sub + '</div></article>';
  }

  function render(root) {
    root.innerHTML = ''
      + '<section class="hero">'
      + '  <span class="eyebrow"><span class="led"></span> Live workspace</span>'
      + '  <h1>Operational records, in one place</h1>'
      + '  <p>Meridian keeps account activity, open items, and reconciliation notes in a single workspace your team can filter, expand, and hand off.</p>'
      + '  <div class="cta"><a class="btn light" href="/records">Open records</a><a class="btn outline" href="/reconcile">Reconcile</a></div>'
      + '</section>'
      + '<section class="tiles">'
      + tile('Records', 'kpi-records', 'across all regions')
      + tile('Total volume', 'kpi-volume', 'settled and pending')
      + tile('Regions', 'kpi-regions', 'active markets')
      + tile('Open items', 'kpi-open', 'pending or flagged')
      + '</section>'
      + '<section class="split">'
      + '  <section class="panel"><div class="panel-head"><h2>Recent records</h2><a class="hint link" href="/records">View all</a></div>'
      + '    <div class="panel-body flush"><div id="recent" class="recent"></div></div></section>'
      + '  <section class="panel"><div class="panel-head"><h2>Needs attention</h2><span class="hint" id="as-of"></span></div>'
      + '    <div class="panel-body"><div class="bars" id="attention"></div>'
      + '    <p class="fine" id="link-line"></p></div></section>'
      + '</section>';

    var alive = true;
    var timer = 0;

    function paintRecent(rows) {
      var host = document.getElementById('recent');
      if (!host) return;
      host.replaceChildren();
      if (!rows.length) {
        var empty = document.createElement('p');
        empty.className = 'fine';
        empty.textContent = 'No records yet.';
        host.appendChild(empty);
        return;
      }
      rows.forEach(function (row) {
        var link = document.createElement('a');
        link.className = 'recent-row';
        link.href = '/records?focus=' + encodeURIComponent(row.id);
        var ref = document.createElement('span');
        ref.className = 'mono';
        ref.textContent = row.ref;
        var mid = document.createElement('span');
        mid.textContent = row.account + ' · ' + row.region;
        var amt = document.createElement('span');
        amt.className = 'num';
        amt.textContent = MeridianFormat.money(row.amount);
        var pill = document.createElement('span');
        pill.className = 'status ' + MeridianFormat.statusClass(row.status);
        pill.textContent = row.status;
        link.append(ref, mid, pill, amt);
        host.appendChild(link);
      });
    }

    function paintAttention(byStatus) {
      var host = document.getElementById('attention');
      if (!host) return;
      var items = (byStatus || []).filter(function (row) {
        return row.status === 'Pending' || row.status === 'Flagged';
      });
      host.replaceChildren();
      if (!items.length) {
        var none = document.createElement('p');
        none.className = 'fine';
        none.textContent = 'Nothing is waiting.';
        host.appendChild(none);
        return;
      }
      var max = Math.max.apply(null, items.map(function (row) { return row.n; }).concat([1]));
      items.forEach(function (row) {
        var line = document.createElement('div');
        line.className = 'bar-row';
        var name = document.createElement('div');
        name.className = 'name';
        name.textContent = row.status;
        var track = document.createElement('div');
        track.className = 'bar-track';
        var fill = document.createElement('div');
        fill.className = 'bar-fill';
        track.appendChild(fill);
        var n = document.createElement('div');
        n.className = 'n';
        n.textContent = String(row.n);
        line.append(name, track, n);
        host.appendChild(line);
        var pct = Math.round((row.n / max) * 100);
        requestAnimationFrame(function () { fill.style.width = pct + '%'; });
      });
    }

    function load() {
      return Promise.all([
        MeridianApi.get('/api/stats'),
        MeridianApi.get('/api/records?limit=6&sort=opened_at&dir=desc'),
      ]).then(function (pair) {
        if (!alive) return;
        var stats = pair[0];
        var recent = (pair[1].rows || []);
        countUp(document.getElementById('kpi-records'), stats.records, function (n) {
          return Math.round(n).toLocaleString('en-US');
        });
        countUp(document.getElementById('kpi-volume'), stats.volume, function (n) {
          return MeridianFormat.money(n);
        });
        countUp(document.getElementById('kpi-regions'), (stats.byRegion || []).length, function (n) {
          return String(Math.round(n));
        });
        var open = (stats.byStatus || []).reduce(function (acc, row) {
          return acc + (row.status === 'Pending' || row.status === 'Flagged' ? row.n : 0);
        }, 0);
        countUp(document.getElementById('kpi-open'), open, function (n) {
          return String(Math.round(n));
        });
        var asOf = document.getElementById('as-of');
        if (asOf) asOf.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        var linkLine = document.getElementById('link-line');
        if (linkLine) {
          var n = stats.reconciliations || 0;
          linkLine.textContent = n === 1 ? '1 reconciliation is on file.' : n + ' reconciliations are on file.';
        }
        paintRecent(recent);
        paintAttention(stats.byStatus);
      }).catch(function () {
        if (!alive) return;
        var asOf = document.getElementById('as-of');
        if (asOf) asOf.textContent = 'Store unavailable';
      });
    }

    load();
    timer = setInterval(load, 20000);
    return function () {
      alive = false;
      clearInterval(timer);
    };
  }

  window.MeridianOverview = { render: render };
})();
