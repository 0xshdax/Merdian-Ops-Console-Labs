'use strict';

(function () {
  function render(root) {
    root.innerHTML = ''
      + '<div class="seg" role="tablist" aria-label="Measure">'
      + '  <button type="button" class="seg-btn on" data-mode="count">Count</button>'
      + '  <button type="button" class="seg-btn" data-mode="volume">Volume</button>'
      + '</div>'
      + '<section class="panel"><div class="panel-head"><h2>By status</h2><span class="hint" id="hint-status"></span></div>'
      + '  <div class="panel-body"><div class="bars" id="by-status"></div></div></section>'
      + '<section class="split">'
      + '  <section class="panel"><div class="panel-head"><h2>By region</h2></div><div class="panel-body"><div class="bars" id="by-region"></div></div></section>'
      + '  <section class="panel"><div class="panel-head"><h2>By channel</h2></div><div class="panel-body"><div class="bars" id="by-channel"></div></div></section>'
      + '</section>';

    var mode = 'count';
    var stats = null;
    var alive = true;

    function valueOf(row) {
      return mode === 'volume' ? Number(row.sum) || 0 : row.n;
    }

    function format(n) {
      if (mode === 'volume') return MeridianFormat.money(n);
      return String(n);
    }

    function paint(host, items) {
      if (!host) return;
      host.replaceChildren();
      var nums = items.map(valueOf);
      var max = Math.max.apply(null, nums.concat([1]));
      items.forEach(function (row) {
        var line = document.createElement('button');
        line.type = 'button';
        line.className = 'bar-row as-btn';
        var name = document.createElement('div');
        name.className = 'name';
        name.textContent = row.status || row.region || row.channel;
        var track = document.createElement('div');
        track.className = 'bar-track';
        var fill = document.createElement('div');
        fill.className = 'bar-fill';
        track.appendChild(fill);
        var n = document.createElement('div');
        n.className = 'n';
        n.textContent = format(valueOf(row));
        line.append(name, track, n);
        if (row.status) {
          line.addEventListener('click', function () {
            MeridianRouter.go('/records?status=' + encodeURIComponent(row.status));
          });
        } else if (row.region) {
          line.addEventListener('click', function () {
            MeridianRouter.go('/records?region=' + encodeURIComponent(row.region));
          });
        }
        host.appendChild(line);
        var pct = Math.round((valueOf(row) / max) * 100);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { fill.style.width = pct + '%'; });
        });
      });
    }

    function draw() {
      if (!stats) return;
      paint(document.getElementById('by-status'), stats.byStatus || []);
      paint(document.getElementById('by-region'), stats.byRegion || []);
      paint(document.getElementById('by-channel'), stats.byChannel || []);
      var hint = document.getElementById('hint-status');
      if (hint) hint.textContent = mode === 'volume' ? 'share of volume' : 'share of records';
    }

    root.querySelectorAll('.seg-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        mode = button.getAttribute('data-mode');
        root.querySelectorAll('.seg-btn').forEach(function (other) {
          other.classList.toggle('on', other === button);
        });
        draw();
      });
    });

    MeridianApi.get('/api/stats').then(function (data) {
      if (!alive) return;
      stats = data;
      draw();
    }).catch(function () {
      if (!alive) return;
      var host = document.getElementById('by-status');
      if (host) host.textContent = 'Insights are unavailable right now.';
    });

    return function () { alive = false; };
  }

  window.MeridianInsights = { render: render };
})();
