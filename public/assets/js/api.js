'use strict';

(function () {
  function send(path, options, token) {
    var opts = options ? Object.assign({}, options) : {};
    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    opts.headers = headers;
    opts.credentials = 'same-origin';
    return fetch(path, opts);
  }

  function request(path, options) {
    return MeridianSession.ready().then(function (session) {
      return send(path, options, session.token).then(function (response) {
        if (response.status !== 401) return response;
        return MeridianSession.refresh().then(function (next) {
          return send(path, options, next.token);
        });
      });
    }).then(function (response) {
      if (response.status === 204) return null;
      return response.json().then(function (body) {
        if (!response.ok) {
          var error = new Error((body && body.error) || 'Request failed');
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  window.MeridianApi = {
    get: function (path) {
      return request(path, { method: 'GET' });
    },
    post: function (path, payload) {
      return request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
    },
    del: function (path) {
      return request(path, { method: 'DELETE' });
    },
  };
})();
