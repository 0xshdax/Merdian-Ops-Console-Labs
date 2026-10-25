'use strict';

(function () {
  var ICONS = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.6 12 3.5l9 7.1"/><path d="M5.2 9.3V20h13.6V9.3"/><path d="M9.7 20v-6.1h4.6V20"/></svg>',
    records: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="4.2" width="17.6" height="15.6" rx="2.2"/><path d="M3.2 9.4h17.6M3.2 14.6h17.6M9 4.4v15.2"/></svg>',
    insights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><rect x="5.5" y="11" width="3.2" height="6" rx="1"/><rect x="10.4" y="6.8" width="3.2" height="10.2" rx="1"/><rect x="15.3" y="13" width="3.2" height="4" rx="1"/></svg>',
    reconcile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7h11M8 12h11M8 17h11"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01"/></svg>',
    workspace: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5 19.2c1.4-2.6 3.8-3.9 7-3.9s5.6 1.3 7 3.9"/></svg>',
  };

  function navLink(item) {
    var icon = ICONS[item.path === '/' ? 'overview' : item.path.slice(1)] || ICONS.records;
    return '<a href="' + item.path + '">' + icon + '<span class="lbl">' + item.title + '</span></a>';
  }

  function shell() {
    var items = MeridianRouter.list();
    var app = document.getElementById('app');
    app.innerHTML = ''
      + '<div class="app">'
      + '  <aside class="sidebar">'
      + '    <div class="side-brand"><span class="mark"></span><span>Meridian<small>Ops Console</small></span></div>'
      + '    <div class="side-label">Workspace</div>'
      + '    <nav class="side-nav">' + items.map(navLink).join('') + '</nav>'
      + '    <div class="side-foot">'
      + '      <span class="status-pill"><span class="led"></span><span id="op-name">Connecting</span></span>'
      + '      <button class="theme-toggle" type="button" id="theme-btn" aria-label="Toggle theme">'
      + '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A7.5 7.5 0 1 1 10.5 4 6 6 0 0 0 20 13.5Z"/></svg>'
      + '      </button>'
      + '    </div>'
      + '  </aside>'
      + '  <div class="main">'
      + '    <header class="topbar">'
      + '      <div class="topbar-title"><h1 id="crumb-title">Overview</h1><p id="crumb-sub"></p></div>'
      + '      <div class="topbar-actions"><button type="button" class="btn ghost" id="palette-open">Search</button><div id="top-actions"></div></div>'
      + '    </header>'
      + '    <main class="content" id="view"></main>'
      + '    <div class="page-foot">Meridian Ops Console</div>'
      + '  </div>'
      + '</div>'
      + '<div id="toasts" class="toasts" aria-live="polite"></div>'
      + '<div class="palette-back" id="palette-back" hidden></div>'
      + '<div class="palette" id="palette" hidden role="dialog" aria-label="Search the workspace">'
      + '  <input id="palette-q" type="text" placeholder="Jump to a view or reference" autocomplete="off">'
      + '  <div id="palette-list" class="palette-list"></div>'
      + '</div>';
  }

  function toast(text) {
    var root = document.getElementById('toasts');
    if (!root) return;
    var node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    root.appendChild(node);
    setTimeout(function () { node.classList.add('out'); }, 2400);
    setTimeout(function () { node.remove(); }, 2800);
  }

  function applyDensity() {
    try {
      if (localStorage.getItem(MeridianWorkspace.densityKey) === 'compact') {
        document.documentElement.setAttribute('data-density', 'compact');
      }
    } catch (err) {}
  }

  var catalog = [];

  function loadCatalog() {
    return MeridianApi.get('/api/records?limit=80&sort=opened_at&dir=desc').then(function (data) {
      catalog = (data.rows || []).map(function (row) {
        return { label: row.ref + ' · ' + row.account, path: '/records?focus=' + encodeURIComponent(row.id) };
      });
    }).catch(function () { catalog = []; });
  }

  function paletteItems(term) {
    var q = term.trim().toLowerCase();
    var pages = MeridianRouter.list().map(function (route) {
      return { label: route.title, hint: route.sub, path: route.path };
    });
    var rows = pages.concat(catalog);
    if (!q) return rows.slice(0, 8);
    return rows.filter(function (item) {
      return (item.label + ' ' + (item.hint || '')).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 10);
  }

  function paintPalette(term) {
    var list = document.getElementById('palette-list');
    var items = paletteItems(term || '');
    list.replaceChildren();
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'fine pad';
      empty.textContent = 'No matches.';
      list.appendChild(empty);
      return;
    }
    items.forEach(function (item, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-item' + (index === 0 ? ' on' : '');
      button.textContent = item.label;
      button.addEventListener('click', function () {
        closePalette();
        MeridianRouter.go(item.path);
      });
      list.appendChild(button);
    });
  }

  function openPalette() {
    if (document.body.classList.contains('is-popout')) return;
    var box = document.getElementById('palette');
    var back = document.getElementById('palette-back');
    box.hidden = false;
    back.hidden = false;
    var input = document.getElementById('palette-q');
    input.value = '';
    paintPalette('');
    input.focus();
  }

  function closePalette() {
    document.getElementById('palette').hidden = true;
    document.getElementById('palette-back').hidden = true;
  }

  window.MeridianUI = { toast: toast };

  applyDensity();
  shell();
  document.getElementById('theme-btn').addEventListener('click', function () {
    if (typeof window.__toggleTheme === 'function') window.__toggleTheme();
  });
  document.getElementById('palette-open').addEventListener('click', openPalette);
  document.getElementById('palette-back').addEventListener('click', closePalette);
  document.getElementById('palette-q').addEventListener('input', function (event) {
    paintPalette(event.target.value);
  });
  document.getElementById('palette-q').addEventListener('keydown', function (event) {
    var items = Array.prototype.slice.call(document.querySelectorAll('.palette-item'));
    var current = items.findIndex(function (item) { return item.classList.contains('on'); });
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;
      var next = event.key === 'ArrowDown' ? current + 1 : current - 1;
      if (next < 0) next = items.length - 1;
      if (next >= items.length) next = 0;
      items.forEach(function (item) { item.classList.remove('on'); });
      items[next].classList.add('on');
      items[next].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      var chosen = items[current] || items[0];
      if (chosen) chosen.click();
    } else if (event.key === 'Escape') {
      closePalette();
    }
  });
  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (document.getElementById('palette').hidden) openPalette();
      else closePalette();
    } else if (event.key === 'Escape') {
      closePalette();
    }
  });

  MeridianSession.ready().then(function (session) {
    var name = (session.claims && session.claims.name) || 'Signed in';
    var slot = document.getElementById('op-name');
    if (slot) slot.textContent = name.split(' ')[0];
    loadCatalog();
    MeridianRouter.start();
  }).catch(function () {
    var view = document.getElementById('view');
    if (view) {
      view.innerHTML = '<section class="panel"><div class="panel-body"><h2>Workspace unavailable</h2>'
        + '<p>The console could not open a session.</p></section>';
    }
  });
})();
