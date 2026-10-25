'use strict';

(function () {
  var DENSITY_KEY = 'meridian-density';

  function render(root) {
    var claims = MeridianSession.claims();
    root.innerHTML = ''
      + '<section class="split">'
      + '  <section class="panel"><div class="panel-head"><h2>Operator</h2></div><div class="panel-body" id="op-card"></div></section>'
      + '  <section class="panel"><div class="panel-head"><h2>Display</h2></div>'
      + '    <div class="panel-body">'
      + '      <p class="fine">Density applies to the records grid on this browser.</p>'
      + '      <div class="seg" id="density" role="group" aria-label="Density">'
      + '        <button type="button" class="seg-btn" data-density="comfortable">Comfortable</button>'
      + '        <button type="button" class="seg-btn" data-density="compact">Compact</button>'
      + '      </div>'
      + '    </div></section>'
      + '</section>'
      + '<section class="panel"><div class="panel-head"><h2>Session scope</h2><span class="hint" id="scope-count"></span></div>'
      + '  <div class="panel-body"><div class="chips" id="scopes"></div></div></section>'
      + '<section class="panel"><div class="panel-body">'
      + '  <p>Meridian is the operations console for account activity. Records, insights, and reconciliation notes stay in this workspace.</p>'
      + '</section>';

    var card = root.querySelector('#op-card');
    [
      ['Name', claims.name || '—'],
      ['Role', claims.role || '—'],
      ['Subject', claims.sub || '—'],
      ['Session started', MeridianFormat.clock(claims.iat) || '—'],
    ].forEach(function (pair) {
      var row = document.createElement('div');
      row.className = 'kv';
      var dt = document.createElement('div');
      dt.textContent = pair[0];
      var dd = document.createElement('div');
      dd.textContent = pair[1];
      row.append(dt, dd);
      card.appendChild(row);
    });

    var scopes = Array.isArray(claims.scope) ? claims.scope : [];
    root.querySelector('#scope-count').textContent = scopes.length + (scopes.length === 1 ? ' scope' : ' scopes');
    var chips = root.querySelector('#scopes');
    scopes.forEach(function (scope) {
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = scope;
      chips.appendChild(chip);
    });

    function density() {
      return document.documentElement.getAttribute('data-density') === 'compact' ? 'compact' : 'comfortable';
    }

    function paintDensity() {
      var current = density();
      root.querySelectorAll('#density .seg-btn').forEach(function (button) {
        button.classList.toggle('on', button.getAttribute('data-density') === current);
      });
    }

    root.querySelectorAll('#density .seg-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = button.getAttribute('data-density');
        if (next === 'compact') document.documentElement.setAttribute('data-density', 'compact');
        else document.documentElement.removeAttribute('data-density');
        try { localStorage.setItem(DENSITY_KEY, next); } catch (err) {}
        paintDensity();
      });
    });
    paintDensity();
  }

  window.MeridianWorkspace = { render: render, densityKey: DENSITY_KEY };
})();
