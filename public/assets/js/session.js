'use strict';

(function () {
  var current = null;
  var pending = null;

  function decodePayload(token) {
    try {
      var part = String(token || '').split('.')[1] || '';
      var json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  }

  function mint() {
    if (pending) return pending;
    pending = fetch('/api/session/token', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ scope: 'ops.records' }),
    }).then(function (response) {
      if (!response.ok) throw new Error('session');
      return response.json();
    }).then(function (body) {
      current = {
        token: body.token,
        expiresIn: body.expiresIn,
        claims: decodePayload(body.token) || {},
      };
      pending = null;
      return current;
    }).catch(function (err) {
      pending = null;
      throw err;
    });
    return pending;
  }

  window.MeridianSession = {
    ready: function () {
      if (current && current.token) return Promise.resolve(current);
      return mint();
    },
    refresh: function () {
      current = null;
      return mint();
    },
    token: function () {
      return current && current.token;
    },
    claims: function () {
      return (current && current.claims) || {};
    },
  };
})();
