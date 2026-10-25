'use strict';

(function () {
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function amount(value) {
    var n = Number(value);
    if (!isFinite(n)) return escapeHtml(value);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function money(value) {
    var n = Number(value);
    if (!isFinite(n)) return '—';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  function date(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!match) return '';
    return MONTHS[Number(match[2]) - 1] + ' ' + Number(match[3]) + ', ' + match[1];
  }

  function clock(unix) {
    if (!unix) return '';
    var d = new Date(unix * 1000);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function statusClass(status) {
    return 's-' + String(status || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  window.MeridianFormat = {
    escape: escapeHtml,
    amount: amount,
    money: money,
    date: date,
    clock: clock,
    statusClass: statusClass,
  };
})();
