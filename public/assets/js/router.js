'use strict';

(function () {
  var cleanup = null;

  function routes() {
    return [
      {
        path: '/',
        title: 'Overview',
        sub: 'A live view of operational records.',
        render: function (root, ctx) { return MeridianOverview.render(root, ctx); },
      },
      {
        path: '/records',
        title: 'Records',
        sub: 'Account activity across regions and channels.',
        render: function (root, ctx) { return MeridianRecords.render(root, ctx); },
      },
      {
        path: '/records/expanded',
        title: 'Records',
        sub: 'Expanded grid',
        bare: true,
        render: function (root, ctx) { return MeridianRecords.renderExpanded(root, ctx); },
      },
      {
        path: '/insights',
        title: 'Insights',
        sub: 'How records break down by status, region, and channel.',
        render: function (root, ctx) { return MeridianInsights.render(root, ctx); },
      },
      {
        path: '/reconcile',
        title: 'Reconcile',
        sub: 'Pair open items and keep a note of the link.',
        render: function (root, ctx) { return MeridianReconcile.render(root, ctx); },
      },
      {
        path: '/workspace',
        title: 'Workspace',
        sub: 'Operator, session, and display preferences.',
        render: function (root, ctx) { return MeridianWorkspace.render(root, ctx); },
      },
    ];
  }

  function normalize(pathname) {
    var path = String(pathname || '/');
    if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1);
    return path || '/';
  }

  function match(table, pathname) {
    var path = normalize(pathname);
    for (var i = 0; i < table.length; i++) {
      if (table[i].path === path) return table[i];
    }
    return null;
  }

  function draw() {
    if (cleanup) {
      try { cleanup(); } catch (err) {}
      cleanup = null;
    }
    var table = routes();
    var route = match(table, location.pathname);
    var missing = !route;
    if (!route) {
      route = {
        path: location.pathname,
        title: 'Not found',
        sub: 'That view is not part of this workspace.',
        render: renderMissing,
      };
    }
    document.body.classList.toggle('is-popout', !!route.bare);
    document.title = route.title + ' · Meridian';
    var title = document.getElementById('crumb-title');
    var sub = document.getElementById('crumb-sub');
    var actions = document.getElementById('top-actions');
    var view = document.getElementById('view');
    if (title) title.textContent = route.title;
    if (sub) sub.textContent = route.sub || '';
    if (actions) actions.replaceChildren();
    if (view) view.replaceChildren();
    document.querySelectorAll('.side-nav a[href]').forEach(function (link) {
      var on = !missing && link.getAttribute('href') === route.path;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (!view) return;
    var result = route.render(view, {
      setActions: function (node) {
        var slot = document.getElementById('top-actions');
        if (!slot) return;
        slot.replaceChildren();
        if (node) slot.appendChild(node);
      },
      navigate: go,
    });
    if (typeof result === 'function') cleanup = result;
  }

  function renderMissing(root) {
    root.innerHTML = '<section class="panel"><div class="panel-body empty-copy">'
      + '<h2>This view is not available</h2>'
      + '<p>The address does not match a workspace page.</p>'
      + '<p><a class="btn primary" href="/">Back to overview</a></p>'
      + '</section>';
  }

  function go(path, replace) {
    var next = path || '/';
    if (replace) history.replaceState(null, '', next);
    else history.pushState(null, '', next);
    draw();
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    var url;
    try { url = new URL(link.getAttribute('href'), location.origin); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    var table = routes();
    if (!match(table, url.pathname)) return;
    event.preventDefault();
    go(url.pathname + url.search + url.hash);
  });

  window.addEventListener('popstate', draw);

  window.MeridianRouter = {
    start: draw,
    go: go,
    list: function () {
      return routes().filter(function (route) { return !route.bare; }).map(function (route) {
        return { path: route.path, title: route.title, sub: route.sub };
      });
    },
  };
})();
