'use strict';

(function () {
  var MSG = 'Config.Send';
  var HIDDEN_KEY = 'meridian-columns-hidden';

  var state = {
    columns: [],
    rows: [],
    hidden: loadHidden(),
    head: null,
    body: null,
    external: false,
    sort: null,
    onSort: null,
  };

  function loadHidden() {
    try {
      var parsed = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveHidden() {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(state.hidden)); } catch (err) {}
  }

  function escapeHtml(value) {
    return MeridianFormat.escape(value);
  }

  function visibleColumns() {
    if (state.external) return state.columns.slice();
    return state.columns.filter(function (column) {
      return state.hidden.indexOf(column.columnId) === -1;
    });
  }

  function normalizeColumn(column) {
    if (!column || typeof column !== 'object') return null;
    return {
      columnId: column.columnId,
      field: column.field,
      label: column.label || column.field || '',
      isDetokenizable: !!column.isDetokenizable,
    };
  }

  function cellHtml(column, row) {
    var raw = row[column.field];
    var text = column.field === 'amount'
      ? MeridianFormat.amount(raw)
      : escapeHtml(raw == null ? '' : raw);
    if (column.field === 'status') {
      text = '<span class="status ' + MeridianFormat.statusClass(raw) + '">' + text + '</span>';
    } else if (column.field === 'opened_at') {
      text = escapeHtml(MeridianFormat.date(raw));
    }
    if (column.isDetokenizable) {
      return '<td class="cell" data-col-id="' + column.columnId + '">' + text + '</td>';
    }
    return '<td class="cell">' + text + '</td>';
  }

  function headerHtml(column) {
    var arrow = '';
    if (state.sort && state.sort.field === column.field) {
      arrow = '<span class="sort-ind" aria-hidden="true">' + (state.sort.dir === 'desc' ? '↓' : '↑') + '</span>';
    }
    return '<th scope="col" data-field="' + escapeHtml(column.field) + '">'
      + escapeHtml(column.label) + arrow + '</th>';
  }

  function render() {
    if (!state.head || !state.body) return;
    var columns = visibleColumns();
    if (!columns.length) {
      state.head.innerHTML = '';
      state.body.innerHTML = '<tr class="empty"><td>No columns selected.</td></tr>';
      return;
    }
    state.head.innerHTML = '<tr>' + columns.map(headerHtml).join('') + '</tr>';
    if (!state.rows.length) {
      state.body.innerHTML = '<tr class="empty"><td colspan="' + columns.length + '">No records in this view.</td></tr>';
      return;
    }
    state.body.innerHTML = state.rows.map(function (row) {
      return '<tr data-id="' + escapeHtml(row.id) + '">'
        + columns.map(function (column) { return cellHtml(column, row); }).join('')
        + '</tr>';
    }).join('');
  }

  function applyColumns(list) {
    var next = (list || []).map(normalizeColumn).filter(Boolean);
    if (!next.length) return;
    state.columns = next;
    render();
  }

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type !== MSG) return;
    var columns = message.config && message.config.defaultColumns;
    if (!Array.isArray(columns)) return;
    state.external = true;
    applyColumns(columns);
  });

  function postLayout(child) {
    if (!child) return;
    var message = {
      type: MSG,
      sessionKey: 'grid-' + Date.now().toString(36),
      config: { defaultColumns: visibleColumns() },
    };
    var attempts = 0;
    var timer = setInterval(function () {
      attempts += 1;
      if (!child || child.closed || attempts > 16) {
        clearInterval(timer);
        return;
      }
      try { child.postMessage(message, '*'); } catch (err) {}
    }, 200);
  }

  function openExpanded() {
    var child = window.open('/records/expanded', 'meridian_expanded', 'width=1280,height=860');
    if (!child) return null;
    postLayout(child);
    return child;
  }

  window.MeridianGrid = {
    attach: function (head, body, hooks) {
      state.head = head;
      state.body = body;
      state.onSort = hooks && hooks.onSort ? hooks.onSort : null;
      if (head && !head.__meridianSort) {
        head.__meridianSort = true;
        head.addEventListener('click', function (event) {
          var th = event.target.closest('th');
          if (!th || !state.onSort) return;
          var field = th.getAttribute('data-field');
          if (field) state.onSort(field);
        });
      }
      render();
      return function detach() {
        if (state.head === head) {
          state.head = null;
          state.body = null;
          state.onSort = null;
        }
      };
    },
    setRows: function (rows) {
      state.rows = rows || [];
      render();
    },
    setSort: function (sort) {
      state.sort = sort || null;
      render();
    },
    loadDefaultColumns: function () {
      if (state.external && state.columns.length) return Promise.resolve(state.columns);
      return MeridianApi.get('/api/records/columns').then(function (data) {
        if (state.external) return state.columns;
        state.columns = data.columns || [];
        render();
        return state.columns;
      });
    },
    getColumns: function () {
      return state.columns.map(function (column) {
        return {
          columnId: column.columnId,
          field: column.field,
          label: column.label,
          isDetokenizable: column.isDetokenizable,
        };
      });
    },
    visibleColumns: visibleColumns,
    hidden: function () {
      return state.hidden.slice();
    },
    setHidden: function (ids) {
      state.hidden = (ids || []).slice();
      saveHidden();
      render();
    },
    usingExternalLayout: function () {
      return state.external;
    },
    openExpanded: openExpanded,
  };
})();
