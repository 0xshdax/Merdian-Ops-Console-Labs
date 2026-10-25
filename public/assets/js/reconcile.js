'use strict';

(function () {
  function render(root) {
    root.innerHTML = ''
      + '<section class="split reconcile">'
      + '  <section class="panel"><div class="panel-head"><h2>Pending</h2><span class="hint" id="n-pending"></span></div>'
      + '    <div class="pick-list" id="list-pending"></div></section>'
      + '  <section class="panel"><div class="panel-head"><h2>Flagged</h2><span class="hint" id="n-flagged"></span></div>'
      + '    <div class="pick-list" id="list-flagged"></div></section>'
      + '</section>'
      + '<section class="panel"><div class="panel-head"><h2>Propose a link</h2></div>'
      + '  <form class="link-form" id="link-form">'
      + '    <p class="fine" id="link-summary">Select one pending record and one flagged record.</p>'
      + '    <label>Note<textarea id="link-note" maxlength="280" rows="3" placeholder="Why these belong together"></textarea></label>'
      + '    <button type="submit" class="btn primary" id="link-submit" disabled>Create link</button>'
      + '  </form></section>'
      + '<section class="panel"><div class="panel-head"><h2>On file</h2><span class="hint" id="n-links"></span></div>'
      + '  <div class="panel-body flush" id="link-list"></div></section>';

    var pendingHost = root.querySelector('#list-pending');
    var flaggedHost = root.querySelector('#list-flagged');
    var summary = root.querySelector('#link-summary');
    var note = root.querySelector('#link-note');
    var submit = root.querySelector('#link-submit');
    var form = root.querySelector('#link-form');
    var linkHost = root.querySelector('#link-list');
    var choice = { pending: null, flagged: null };
    var alive = true;

    function paintPicks(host, rows, key) {
      host.replaceChildren();
      if (!rows.length) {
        var empty = document.createElement('p');
        empty.className = 'fine pad';
        empty.textContent = 'None in this queue.';
        host.appendChild(empty);
        return;
      }
      rows.forEach(function (row) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'pick' + (choice[key] && choice[key].id === row.id ? ' on' : '');
        var ref = document.createElement('span');
        ref.className = 'mono';
        ref.textContent = row.ref;
        var mid = document.createElement('span');
        mid.textContent = row.account + ' · ' + row.region;
        var amt = document.createElement('span');
        amt.className = 'num';
        amt.textContent = MeridianFormat.amount(row.amount);
        button.append(ref, mid, amt);
        button.addEventListener('click', function () {
          choice[key] = choice[key] && choice[key].id === row.id ? null : row;
          paintAll(lastRows);
          syncSummary();
        });
        host.appendChild(button);
      });
    }

    var lastRows = { pending: [], flagged: [] };

    function paintAll(groups) {
      lastRows = groups;
      paintPicks(pendingHost, groups.pending, 'pending');
      paintPicks(flaggedHost, groups.flagged, 'flagged');
      root.querySelector('#n-pending').textContent = String(groups.pending.length);
      root.querySelector('#n-flagged').textContent = String(groups.flagged.length);
    }

    function syncSummary() {
      if (choice.pending && choice.flagged) {
        summary.textContent = choice.pending.ref + ' will be linked with ' + choice.flagged.ref + '.';
        submit.disabled = false;
      } else {
        summary.textContent = 'Select one pending record and one flagged record.';
        submit.disabled = true;
      }
    }

    function paintLinks(rows) {
      linkHost.replaceChildren();
      root.querySelector('#n-links').textContent = String(rows.length);
      if (!rows.length) {
        var empty = document.createElement('p');
        empty.className = 'fine pad';
        empty.textContent = 'No links yet.';
        linkHost.appendChild(empty);
        return;
      }
      rows.forEach(function (row) {
        var line = document.createElement('div');
        line.className = 'link-row';
        var text = document.createElement('div');
        var title = document.createElement('strong');
        title.textContent = row.left_ref + '  ↔  ' + row.right_ref;
        var meta = document.createElement('p');
        meta.textContent = (row.note || 'No note') + ' · ' + MeridianFormat.amount(row.left_amount)
          + ' / ' + MeridianFormat.amount(row.right_amount);
        text.append(title, meta);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn';
        remove.textContent = 'Remove';
        remove.addEventListener('click', function () {
          remove.disabled = true;
          MeridianApi.del('/api/reconciliations/' + encodeURIComponent(row.id)).then(loadLinks).catch(function () {
            remove.disabled = false;
            if (window.MeridianUI) MeridianUI.toast('Could not remove that link');
          });
        });
        line.append(text, remove);
        linkHost.appendChild(line);
      });
    }

    function loadQueues() {
      return Promise.all([
        MeridianApi.get('/api/records?status=Pending&limit=200'),
        MeridianApi.get('/api/records?status=Flagged&limit=200'),
      ]).then(function (pair) {
        if (!alive) return;
        paintAll({ pending: pair[0].rows || [], flagged: pair[1].rows || [] });
        if (choice.pending && !lastRows.pending.some(function (row) { return row.id === choice.pending.id; })) choice.pending = null;
        if (choice.flagged && !lastRows.flagged.some(function (row) { return row.id === choice.flagged.id; })) choice.flagged = null;
        syncSummary();
      });
    }

    function loadLinks() {
      return MeridianApi.get('/api/reconciliations').then(function (data) {
        if (!alive) return;
        paintLinks(data.reconciliations || []);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!choice.pending || !choice.flagged) return;
      submit.disabled = true;
      MeridianApi.post('/api/reconciliations', {
        leftId: choice.pending.id,
        rightId: choice.flagged.id,
        note: note.value,
      }).then(function () {
        note.value = '';
        choice.pending = null;
        choice.flagged = null;
        syncSummary();
        if (window.MeridianUI) MeridianUI.toast('Link added');
        return Promise.all([loadQueues(), loadLinks()]);
      }).catch(function (err) {
        submit.disabled = false;
        if (window.MeridianUI) MeridianUI.toast(err.message || 'Could not create the link');
      });
    });

    Promise.all([loadQueues(), loadLinks()]).catch(function () {
      if (!alive) return;
      summary.textContent = 'The reconciliation store did not respond.';
    });

    return function () { alive = false; };
  }

  window.MeridianReconcile = { render: render };
})();
