// Restricted Alerts page. The sensitive data is protected by the server
// (/api/alerts returns 401 unless a valid admin session cookie is present); this
// script just drives the login gate and renders alerts once signed in.
(function () {
  var loginPanel = document.getElementById('loginPanel');
  var alertsPanel = document.getElementById('alertsPanel');
  var loginForm = document.getElementById('loginForm');
  var loginBtn = document.getElementById('loginBtn');
  var loginStatus = document.getElementById('loginStatus');
  var logoutBtn = document.getElementById('logoutBtn');
  var whoEmail = document.getElementById('whoEmail');
  var alertsEl = document.getElementById('alerts');
  var emailInput = document.getElementById('email');
  var passwordInput = document.getElementById('password');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function setLoginStatus(kind, msg) {
    loginStatus.className = 'status' + (kind ? ' ' + kind : '');
    loginStatus.style.display = kind ? 'block' : 'none';
    loginStatus.textContent = msg || '';
  }

  function showLogin() {
    alertsPanel.hidden = true;
    loginPanel.hidden = false;
  }
  function showAlerts(email) {
    loginPanel.hidden = true;
    alertsPanel.hidden = false;
    if (whoEmail) whoEmail.textContent = email || '';
  }

  function renderAlerts(alerts) {
    if (!alerts || !alerts.length) {
      alertsEl.innerHTML = '<p class="empty">No alerts yet.</p>';
      return;
    }
    alertsEl.innerHTML = alerts.map(function (a) {
      var when = new Date(a.createdAt).toLocaleString();
      var contact = a.parentEmail || a.parentPhone || 'no contact on file';
      return (
        '<div class="alert-card">' +
          '<p class="meta"><span class="pct">' + esc(a.matchPercent) + '% match</span> — ' +
            'possible sighting of <strong>' + esc(a.childName) + '</strong></p>' +
          '<div class="photos">' +
            '<figure><img src="' + esc(a.childPhotoUrl) + '" alt="Registered photo" />' +
              '<figcaption>Registered photo</figcaption></figure>' +
            '<figure><img src="' + esc(a.foundPhotoUrl) + '" alt="Photo uploaded by finder" />' +
              '<figcaption>Photo uploaded by finder</figcaption></figure>' +
          '</div>' +
          '<p class="meta">To family: ' + esc(a.parentName) + ' (' + esc(contact) + ')</p>' +
          (a.location ? '<p class="meta">Seen at: ' + esc(a.location) + '</p>' : '') +
          (a.finderName || a.finderContact
            ? '<p class="meta">Finder: ' + esc(a.finderName || '—') +
              (a.finderContact ? ' (' + esc(a.finderContact) + ')' : '') + '</p>'
            : '') +
          (a.note ? '<p class="meta">Note: ' + esc(a.note) + '</p>' : '') +
          '<p class="meta hint">' + esc(when) + '</p>' +
        '</div>'
      );
    }).join('');
  }

  function loadAlerts() {
    alertsEl.innerHTML = '<p class="empty">Loading…</p>';
    return fetch('/api/alerts', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { showLogin(); return; }
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || 'Could not load alerts.');
          renderAlerts(data.alerts || []);
        });
      })
      .catch(function () {
        alertsEl.innerHTML = '<p class="empty">Could not load alerts.</p>';
      });
  }

  // On page load, check whether we're already signed in.
  fetch('/api/login', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (s && s.authenticated) { showAlerts(s.email); loadAlerts(); }
      else showLogin();
    })
    .catch(showLogin);

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    loginBtn.disabled = true;
    setLoginStatus('info', 'Signing in…');
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { setLoginStatus('error', res.d.error || 'Sign-in failed.'); return; }
        setLoginStatus('', '');
        loginForm.reset();
        showAlerts(res.d.email);
        loadAlerts();
      })
      .catch(function () { setLoginStatus('error', 'Sign-in failed. Please try again.'); })
      .finally(function () { loginBtn.disabled = false; });
  });

  logoutBtn.addEventListener('click', function () {
    fetch('/api/login', { method: 'DELETE', credentials: 'same-origin' })
      .then(showLogin)
      .catch(showLogin);
  });
})();
