// Renders search results into a container. No deps. Exposes:
//   window.renderResultView(container, matches, { reduceMotion })
// matches[] = { childName, ageWhenMissing, dateMissing, childPhotoUrl, matchPercent }
(function () {
  var CIRC = 264; // MUST equal CSS .conf-ring .val stroke-dasharray (2π·42 ≈ 263.9)

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function refId() {
    return 'MCF-' +
      new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' +
      Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function countUp(numEl, ringEl, target, reduceMotion) {
    function setRing(pct) {
      if (ringEl) ringEl.style.strokeDashoffset = String(CIRC - (CIRC * pct / 100));
    }
    if (reduceMotion) { numEl.textContent = target + '%'; setRing(target); return; }
    var start = performance.now(), dur = 1100;
    function frame(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      numEl.textContent = Math.round(eased * target) + '%';
      setRing(eased * target);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var ICON_AGE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="8" r="3.4"/>' +
    '<path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';
  var ICON_DATE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/>' +
    '<path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/>' +
    '<circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none"/></svg>';
  var ICON_TIME =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

  // "4 yrs 2 mo" style duration from a millisecond span.
  function fmtDuration(ms) {
    var months = Math.floor(ms / (30.44 * 24 * 3600 * 1000));
    if (months < 1) return 'under a month';
    var y = Math.floor(months / 12), mo = months % 12, parts = [];
    if (y) parts.push(y + (y > 1 ? ' yrs' : ' yr'));
    if (mo) parts.push(mo + ' mo');
    return parts.join(' ');
  }

  // Time since the child went missing + an estimated current age (age when
  // missing + years elapsed). Returns null if the date is unusable.
  function ageInfo(dateMissing, ageWhenMissing) {
    var then = new Date(dateMissing);
    if (isNaN(then.getTime())) return null;
    var ms = Date.now() - then.getTime();
    if (ms < 0) ms = 0;
    var out = { elapsed: fmtDuration(ms), currentAge: null };
    var a = Number(ageWhenMissing);
    if (isFinite(a) && a >= 0) out.currentAge = Math.round(a + ms / (365.25 * 24 * 3600 * 1000));
    return out;
  }

  // One dossier stat tile: icon tile · label · value.
  function tile(icon, label, value, accent) {
    return '<span class="mc-row' + (accent ? ' is-accent' : '') + '">' +
      '<span class="mc-ico">' + icon + '</span>' +
      '<span class="mc-cell"><span class="mc-k">' + label + '</span>' +
      '<span class="mc-v">' + value + '</span></span></span>';
  }

  function cardsHtml(matches, reduceMotion) {
    var html = '';
    matches.forEach(function (m, i) {
      var pct = Math.max(0, Math.min(100, Number(m.matchPercent) || 0));
      var delay = reduceMotion ? 0 : (0.55 + i * 0.1);
      var wide = !!m.wideAgeGap; // kept only via the relaxed age-gap threshold
      var ai = ageInfo(m.dateMissing, m.ageWhenMissing);

      var meta =
        (m.ageWhenMissing ? tile(ICON_AGE, 'Age when missing', esc(m.ageWhenMissing), false) : '') +
        tile(ICON_DATE, 'Missing since', esc(m.dateMissing), true) +
        (ai ? tile(ICON_TIME, 'Time missing', esc(ai.elapsed), false) : '') +
        (ai && ai.currentAge != null
          ? tile(ICON_AGE, 'Est. age now', '~' + esc(ai.currentAge) + ' yrs', true) : '');

      html +=
        '<article class="mc card-in' + (wide ? ' is-wide' : '') + '" style="animation-delay:' + delay + 's">' +
          '<div class="mc-photo">' +
            '<img src="' + esc(m.childPhotoUrl) + '" alt="Registered photo of ' +
              esc(m.childName) + '" />' +
            '<span class="mc-score">' +
              '<svg viewBox="0 0 72 72" aria-hidden="true">' +
                '<circle class="ring-track" cx="36" cy="36" r="33"/>' +
                '<circle class="ring-val" cx="36" cy="36" r="33" ' +
                  'style="--mc-ring-target:' + (207 - 207 * pct / 100).toFixed(1) + '"/>' +
              '</svg>' +
              '<b>' + esc(m.matchPercent) + '%</b>' +
            '</span>' +
          '</div>' +
          '<div class="mc-body">' +
            '<div class="mc-head">' +
              '<h4 class="mc-name">' + esc(m.childName) + '</h4>' +
              '<span class="mc-chip' + (wide ? ' is-wide' : '') + '">' +
                (wide ? 'Wider age gap' : 'Possible match') + '</span>' +
            '</div>' +
            '<div class="mc-strength">' +
              '<div class="mc-bar-top">' +
                '<span class="mc-bar-lbl">Facial similarity</span>' +
                '<span class="mc-bar-pct">' + pct + '%</span>' +
              '</div>' +
              '<div class="mc-bar"><i data-pct="' + pct + '" style="width:' +
                (reduceMotion ? pct : 0) + '%"></i></div>' +
            '</div>' +
            (wide
              ? '<p class="mc-note">Below the usual 80% match, but kept because of the long ' +
                'time since this child went missing (faces change a lot with age). ' +
                'Lower confidence — please verify this one especially carefully.</p>'
              : '') +
            '<div class="mc-meta">' + meta + '</div>' +
          '</div>' +
        '</article>';
    });
    return html;
  }

  function renderMatch(container, matches, reduceMotion) {
    var top = matches.reduce(function (a, b) {
      return b.matchPercent > a.matchPercent ? b : a;
    }, matches[0]);

    container.innerHTML =
      '<div class="result-view match-found' + (reduceMotion ? '' : ' reveal') + '">' +

        '<div class="match-head">' +
          '<svg class="match-check" viewBox="0 0 52 52" aria-hidden="true">' +
            '<circle cx="26" cy="26" r="23"/>' +
            '<path d="M16 27l7 7 14-15"/>' +
          '</svg>' +
          '<div>' +
            '<h3>A possible match was found</h3>' +
            '<p>The registered family has been alerted with the photo you uploaded.</p>' +
          '</div>' +
        '</div>' +

        '<div class="dispatch-notice" role="alert">' +
          '<svg class="dispatch-icon" viewBox="0 0 32 32" aria-hidden="true">' +
            '<circle class="ping" cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<circle cx="16" cy="16" r="4" fill="currentColor"/>' +
            '<path d="M16 2v4M16 26v4M2 16h4M26 16h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
          '</svg>' +
          '<div>' +
            '<span class="dispatch-badge">Priority alert</span>' +
            '<p class="dispatch-title">Alert dispatched to nearest police station</p>' +
            '<p class="dispatch-sub">This match has been flagged to local authorities with the ' +
              'photo and location so they can verify it safely. If you believe the child may be in ' +
              'immediate danger, call your emergency number now. Please do not approach the child ' +
              'or anyone with them.</p>' +
            '<p class="dispatch-ref">Logged ' + esc(new Date().toLocaleString()) +
              ' · Ref ' + refId() + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="family-alerted">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>' +
          '<span>The family has been alerted with the photo you uploaded.</span>' +
        '</div>' +

        '<div class="confidence">' +
          '<div class="conf-ring">' +
            '<svg viewBox="0 0 96 96" aria-hidden="true">' +
              '<circle class="track" cx="48" cy="48" r="42"/>' +
              '<circle class="val"   cx="48" cy="48" r="42"/>' +
            '</svg>' +
            '<div class="conf-num">0%</div>' +
          '</div>' +
          '<div class="conf-text">' +
            '<h4>Match confidence</h4>' +
            '<p>Highest similarity across the registry. A possible match is not proof; ' +
              'authorities will confirm.</p>' +
          '</div>' +
        '</div>' +

        cardsHtml(matches, reduceMotion) +
      '</div>';

    var numEl = container.querySelector('.conf-num');
    var ringEl = container.querySelector('.conf-ring .val');
    var begin = function () { countUp(numEl, ringEl, top.matchPercent, reduceMotion); };
    if (reduceMotion) begin();
    else setTimeout(begin, 450);

    // Fill each card's facial-similarity bar (CSS transitions the width from 0).
    var bars = container.querySelectorAll('.mc-bar > i');
    var fill = function () {
      Array.prototype.forEach.call(bars, function (b) {
        b.style.width = (b.getAttribute('data-pct') || 0) + '%';
      });
    };
    if (reduceMotion) fill();
    else requestAnimationFrame(function () { requestAnimationFrame(fill); });
  }

  function renderNoMatch(container, reduceMotion) {
    container.innerHTML =
      '<div class="result-view no-match' + (reduceMotion ? '' : ' reveal') + '">' +
        '<div class="nomatch-head">' +
          '<svg class="nomatch-icon" viewBox="0 0 48 48" aria-hidden="true">' +
            '<circle cx="24" cy="24" r="20" fill="none" stroke="#9fb1c2" stroke-width="2.5"/>' +
            '<path d="M16 24h16" fill="none" stroke="#9fb1c2" stroke-width="2.5" stroke-linecap="round"/>' +
          '</svg>' +
          '<div>' +
            '<h3>No strong match found yet</h3>' +
            '<p>We carefully compared this face against every registered child and ' +
              'did not find a confident match. This does not rule anything out.</p>' +
          '</div>' +
        '</div>' +
        '<p class="nomatch-advice">Please still report this child to your local ' +
          'police or child-protection authorities — they can help confirm the ' +
          'child’s identity safely. Thank you for checking.</p>' +
      '</div>';
  }

  function renderResultView(container, matches, opts) {
    opts = opts || {};
    var reduceMotion = !!opts.reduceMotion;
    if (!matches || matches.length === 0) renderNoMatch(container, reduceMotion);
    else renderMatch(container, matches, reduceMotion);
  }

  window.renderResultView = renderResultView;
})();
