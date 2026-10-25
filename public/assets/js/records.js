'use strict';

(function () {
  var PAGE = 12;

  function debounce(fn, ms) {
    var timer = 0;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function actionButton(id, label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.id = id;
    button.textContent = label;
    return button;
  }

  function render(root, ctx) {
    root.innerHTML = ''
      + '<div class="toolbar">'
      + '  <label class="search"><span class="sr">Search</span>'
      + '    <input id="f-q" type="search" placeholder="Search reference, account, counterparty" autocomplete="off">'
      + '  </label>'
      + '  <label class="select"><span class="sr">Status</span><select id="f-status">'
      + '    <option value="">All statuses</option>'
      + '    <option>Matched</option><option>Pending</option><option>Flagged</option><option>Cleared</option>'
      + '  </select></label>'
      + '  <label class="select"><span class="sr">Region</span><select id="f-region">'
      + '    <option value="">All regions</option>'
      + '    <option>NA</option><option>EU</option><option>APAC</option><option>LATAM</option>'
      + '  </select></label>'
      + '  <div class="col-menu">'
      + '    <button type="button" class="btn" id="btn-cols" aria-expanded="false">Columns</button>'
      + '    <div class="col-pop" id="col-pop" hidden></div>'
      + '  </div>'
      + '  <span class="count" id="grid-count"></span>'
      + '</div>'
      + '<div id="query-banner" class="query-banner" hidden></div>'
      + '<div class="table-wrap"><table class="grid"><thead id="grid-head"></thead><tbody id="grid-body"></tbody></table></div>'
      + '<nav class="pager" id="pager" aria-label="Pages"></nav>'
      + '<div class="drawer-back" id="drawer-back" hidden></div>'
      + '<aside class="drawer" id="drawer" hidden aria-labelledby="drawer-title">'
      + '  <header class="drawer-head"><div><p class="eyebrow-ink" id="drawer-ref"></p><h2 id="drawer-title">Record</h2></div>'
      + '    <button type="button" class="icon-btn" id="drawer-close" aria-label="Close">×</button></header>'
      + '  <div class="drawer-body" id="drawer-body"></div>'
      + '</aside>';

    var qInput = root.querySelector('#f-q');
    var statusSel = root.querySelector('#f-status');
    var regionSel = root.querySelector('#f-region');
    var banner = root.querySelector('#query-banner');
    var head = root.querySelector('#grid-head');
    var body = root.querySelector('#grid-body');
    var count = root.querySelector('#grid-count');
    var pager = root.querySelector('#pager');
    var pop = root.querySelector('#col-pop');
    var colsBtn = root.querySelector('#btn-cols');
    var drawer = root.querySelector('#drawer');
    var backdrop = root.querySelector('#drawer-back');
    var all = [];
    var page = 1;
    var sort = { field: 'opened_at', dir: 'desc' };
    var openId = null;
    var alive = true;

    var refreshBtn = actionButton('btn-refresh', 'Refresh');
    var exportBtn = actionButton('btn-export', 'Export');
    var expandBtn = actionButton('btn-expand', 'Expand');
    expandBtn.classList.add('primary');
    var actions = document.createElement('div');
    actions.className = 'action-row';
    actions.append(refreshBtn, exportBtn, expandBtn);
    ctx.setActions(actions);

    function readUrl() {
      var params = new URLSearchParams(location.search);
      qInput.value = params.get('q') || '';
      statusSel.value = params.get('status') || '';
      regionSel.value = params.get('region') || '';
      if (statusSel.selectedIndex < 0) statusSel.value = '';
      if (regionSel.selectedIndex < 0) regionSel.value = '';
      MeridianQuery.paint(banner);
      return params;
    }

    function writeUrl() {
      var params = new URLSearchParams();
      var term = qInput.value.trim();
      if (term) params.set('q', term);
      if (statusSel.value) params.set('status', statusSel.value);
      if (regionSel.value) params.set('region', regionSel.value);
      if (openId) params.set('focus', String(openId));
      var next = '/records' + (params.toString() ? '?' + params.toString() : '');
      if (next !== location.pathname + location.search) history.replaceState(null, '', next);
      MeridianQuery.paint(banner);
    }

    function filtered() {
      var term = qInput.value.trim().toLowerCase();
      var status = statusSel.value;
      var region = regionSel.value;
      var rows = all.filter(function (row) {
        if (status && row.status !== status) return false;
        if (region && row.region !== region) return false;
        if (!term) return true;
        var hay = [row.ref, row.account, row.owner, row.gl_code, row.channel, row.region].join(' ').toLowerCase();
        return hay.indexOf(term) !== -1;
      });
      var field = sort.field;
      var dir = sort.dir === 'desc' ? -1 : 1;
      rows.sort(function (a, b) {
        if (field === 'amount' || field === 'id') return (Number(a[field]) - Number(b[field])) * dir;
        return String(a[field] == null ? '' : a[field]).localeCompare(String(b[field] == null ? '' : b[field])) * dir;
      });
      return rows;
    }

    function paintPager(pages) {
      pager.replaceChildren();
      var label = document.createElement('span');
      label.textContent = 'Page ' + page + ' of ' + pages;
      var prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'btn';
      prev.textContent = 'Previous';
      prev.disabled = page <= 1;
      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn';
      next.textContent = 'Next';
      next.disabled = page >= pages;
      prev.addEventListener('click', function () { page -= 1; paintPage(); });
      next.addEventListener('click', function () { page += 1; paintPage(); });
      pager.append(prev, label, next);
    }

    function paintPage() {
      var rows = filtered();
      var pages = Math.max(1, Math.ceil(rows.length / PAGE));
      if (page > pages) page = pages;
      if (page < 1) page = 1;
      var slice = rows.slice((page - 1) * PAGE, page * PAGE);
      MeridianGrid.setSort(sort);
      MeridianGrid.setRows(slice);
      count.textContent = rows.length + (rows.length === 1 ? ' row' : ' rows');
      paintPager(pages);
    }

    function paintColumns() {
      var columns = MeridianGrid.getColumns();
      var hidden = MeridianGrid.hidden();
      pop.replaceChildren();
      columns.forEach(function (column) {
        var label = document.createElement('label');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('data-col', String(column.columnId));
        input.checked = hidden.indexOf(column.columnId) === -1;
        var text = document.createElement('span');
        text.textContent = column.label || column.field || 'Column';
        label.append(input, text);
        pop.appendChild(label);
      });
    }

    function fieldRow(title, value) {
      var row = document.createElement('div');
      row.className = 'kv';
      var dt = document.createElement('div');
      dt.textContent = title;
      var dd = document.createElement('div');
      dd.textContent = value == null || value === '' ? '—' : String(value);
      row.append(dt, dd);
      return row;
    }

    function closeDrawer() {
      openId = null;
      drawer.hidden = true;
      backdrop.hidden = true;
      writeUrl();
    }

    function fillDrawer(record) {
      var bodyEl = root.querySelector('#drawer-body');
      var title = root.querySelector('#drawer-title');
      var ref = root.querySelector('#drawer-ref');
      title.textContent = record.account;
      ref.textContent = record.ref;
      bodyEl.replaceChildren();
      var grid = document.createElement('div');
      grid.className = 'kv-grid';
      [
        ['Status', record.status],
        ['Amount', MeridianFormat.amount(record.amount)],
        ['Region', record.region],
        ['Channel', record.channel],
        ['Counterparty', record.owner],
        ['GL code', record.gl_code],
        ['Opened', MeridianFormat.date(record.opened_at)],
      ].forEach(function (pair) { grid.appendChild(fieldRow(pair[0], pair[1])); });
      bodyEl.appendChild(grid);

      var form = document.createElement('form');
      form.className = 'note-form';
      var label = document.createElement('label');
      label.textContent = 'Internal note';
      var area = document.createElement('textarea');
      area.maxLength = 280;
      area.rows = 4;
      area.value = record.note || '';
      var save = document.createElement('button');
      save.type = 'submit';
      save.className = 'btn primary';
      save.textContent = 'Save note';
      label.appendChild(area);
      form.append(label, save);
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        save.disabled = true;
        MeridianApi.post('/api/records/' + encodeURIComponent(record.id) + '/note', { note: area.value })
          .then(function (data) {
            var updated = data.record;
            var idx = all.findIndex(function (row) { return row.id === updated.id; });
            if (idx !== -1) all[idx] = updated;
            if (window.MeridianUI) MeridianUI.toast('Note saved');
          })
          .catch(function () {
            if (window.MeridianUI) MeridianUI.toast('Note could not be saved');
          })
          .then(function () { save.disabled = false; });
      });
      bodyEl.appendChild(form);
    }

    function openDrawer(id) {
      openId = String(id);
      drawer.hidden = false;
      backdrop.hidden = false;
      root.querySelector('#drawer-title').textContent = 'Loading…';
      root.querySelector('#drawer-ref').textContent = '';
      root.querySelector('#drawer-body').replaceChildren();
      writeUrl();
      MeridianApi.get('/api/records/' + encodeURIComponent(id)).then(function (data) {
        if (!alive || String(openId) !== String(id)) return;
        fillDrawer(data.record);
      }).catch(function () {
        if (!alive) return;
        root.querySelector('#drawer-title').textContent = 'Unavailable';
      });
    }

    function loadRows() {
      return MeridianApi.get('/api/records?limit=500').then(function (data) {
        if (!alive) return;
        all = data.rows || [];
        paintPage();
        var focus = new URLSearchParams(location.search).get('focus');
        if (focus) openDrawer(focus);
      }).catch(function () {
        if (!alive) return;
        count.textContent = 'Unable to load';
        body.innerHTML = '<tr class="empty"><td>The record store did not respond.</td></tr>';
      });
    }

    var detach = MeridianGrid.attach(head, body, {
      onSort: function (field) {
        if (sort.field === field) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
        else {
          sort.field = field;
          sort.dir = field === 'amount' || field === 'opened_at' ? 'desc' : 'asc';
        }
        page = 1;
        paintPage();
      },
    });

    readUrl();
    MeridianGrid.setSort(sort);
    MeridianGrid.loadDefaultColumns().then(function () { if (alive) paintColumns(); }).catch(function () {});
    loadRows();

    qInput.addEventListener('input', debounce(function () {
      page = 1;
      writeUrl();
      paintPage();
    }, 160));
    statusSel.addEventListener('change', function () { page = 1; writeUrl(); paintPage(); });
    regionSel.addEventListener('change', function () { page = 1; writeUrl(); paintPage(); });
    refreshBtn.addEventListener('click', function () { loadRows(); });
    exportBtn.addEventListener('click', function () { exportCsv(filtered()); });
    expandBtn.addEventListener('click', function () { MeridianGrid.openExpanded(); });
    colsBtn.addEventListener('click', function () {
      var willOpen = pop.hidden;
      pop.hidden = !willOpen;
      colsBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    pop.addEventListener('change', function () {
      var hidden = [];
      pop.querySelectorAll('input[data-col]').forEach(function (input) {
        if (!input.checked) hidden.push(input.getAttribute('data-col'));
      });
      MeridianGrid.setHidden(hidden);
    });
    body.addEventListener('click', function (event) {
      var row = event.target.closest('tr[data-id]');
      if (!row) return;
      openDrawer(row.getAttribute('data-id'));
    });
    root.querySelector('#drawer-close').addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);

    function onKey(event) {
      if (event.key === 'Escape' && openId) closeDrawer();
      if (event.key === '/' && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        event.preventDefault();
        qInput.focus();
      }
    }
    function onDocClick(event) {
      if (!colsBtn.contains(event.target) && !pop.contains(event.target)) {
        pop.hidden = true;
        colsBtn.setAttribute('aria-expanded', 'false');
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);

    return function () {
      alive = false;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDocClick);
      detach();
    };
  }

  function exportCsv(rows) {
    var columns = MeridianGrid.visibleColumns();
    var lines = [columns.map(function (column) { return csvCell(column.label); }).join(',')];
    rows.forEach(function (row) {
      lines.push(columns.map(function (column) {
        var value = row[column.field];
        if (column.field === 'opened_at') value = MeridianFormat.date(value);
        return csvCell(value);
      }).join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'meridian-records.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function csvCell(value) {
    var text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function renderExpanded(root) {
    root.innerHTML = ''
      + '<div class="expanded-bar"><div><h2>Records</h2><p>Layout follows the workspace that opened this view.</p></div>'
      + '<span class="count" id="grid-count"></span></div>'
      + '<div class="table-wrap tall"><table class="grid"><thead id="grid-head"></thead><tbody id="grid-body"></tbody></table></div>';
    var head = root.querySelector('#grid-head');
    var body = root.querySelector('#grid-body');
    var count = root.querySelector('#grid-count');
    var detach = MeridianGrid.attach(head, body);
    var alive = true;
    MeridianGrid.loadDefaultColumns().catch(function () {});
    MeridianApi.get('/api/records?limit=500').then(function (data) {
      if (!alive) return;
      var rows = data.rows || [];
      MeridianGrid.setRows(rows);
      count.textContent = rows.length + (rows.length === 1 ? ' row' : ' rows');
    }).catch(function () {
      if (!alive) return;
      count.textContent = 'Unable to load';
    });
    return function () {
      alive = false;
      detach();
    };
  }

  window.MeridianRecords = { render: render, renderExpanded: renderExpanded };
})();
