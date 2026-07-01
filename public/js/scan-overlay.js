// Biometric scan overlay rendered directly over the user's uploaded photo.
// Self-contained, no deps. Exposes window.createScanOverlay(frameEl).
//
//   const scan = createScanOverlay(document.getElementById('previewFrame'));
//   scan.start();                 // mount + begin looping + staged labels (describeFace phase)
//   ... await describeFace(file) ...
//   scan.compare();               // advance HUD to "Comparing against registry"
//   ... await fetch('/api/search') ...
//   await scan.finish();          // resolves after MIN_DURATION elapsed, then fades out
//   // on error:  scan.abort();   // remove immediately
//
// The looping animation is CSS. JS only advances phase LABELS / data readouts on
// timers and enforces a minimum visible duration. The overlay can NEVER end
// before the real work resolves, because finish() is only CALLED after the real
// async work has awaited. There are no real progress events; the data is staged.
(function () {
  var MIN_DURATION = 1800; // ms — overlay stays at least this long (never flashes)

  // Phases for the describeFace stage (timer-driven narrative, NOT real progress).
  // The last of these holds indefinitely until compare()/finish() is called.
  var PHASES = [
    { t: 0,    label: 'Detecting face',                sub: 'Locating facial region' },
    { t: 650,  label: 'Aligning landmarks',            sub: '68-point face geometry' },
    { t: 1300, label: 'Extracting 128-D fingerprint',  sub: 'Computing biometric vector' },
  ];
  var COMPARE = { label: 'Comparing against registry', sub: 'Matching every reported child' };
  var FINAL   = { label: 'Finalizing results',         sub: '' };

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function rand16(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s.toUpperCase();
  }

  function pad3(n) { n = String(n); return '000'.slice(n.length) + n; }

  function buildDOM() {
    var o = document.createElement('div');
    o.className = 'scan-overlay';
    o.setAttribute('aria-hidden', 'true'); // SR users get #status text in search.js
    o.innerHTML =
      '<div class="scan-grid"></div>' +
      '<div class="scan-beam"></div>' +
      '<div class="scan-brackets">' +
        '<span class="tl"></span><span class="tr"></span>' +
        '<span class="bl"></span><span class="br"></span>' +
      '</div>' +
      '<div class="scan-reticle"></div>' +
      '<div class="scan-readout">' +
        '<div class="scan-phase-row">' +
          '<svg class="scan-spinner" viewBox="0 0 30 30">' +
            '<circle class="track" cx="15" cy="15" r="12"></circle>' +
            '<circle class="ind"   cx="15" cy="15" r="12"></circle>' +
          '</svg>' +
          '<div>' +
            '<div class="scan-phase">Detecting face</div>' +
            '<div class="scan-sub">Locating facial region</div>' +
          '</div>' +
        '</div>' +
        '<div class="scan-data">' +
          '<div class="d-row"><span class="d-key">DESCRIPTOR</span>' +
            '<span class="d-val js-hex">0x' + rand16(8) + '</span></div>' +
          '<div class="d-row"><span class="d-key">VECTOR</span>' +
            '<span class="d-val js-vec">000 / 128</span></div>' +
          '<div class="scan-bar"></div>' +
        '</div>' +
      '</div>';
    return o;
  }

  function createScanOverlay(frameEl) {
    if (!frameEl) {
      // No preview frame on the page: return a no-op controller.
      return {
        start: function () {}, compare: function () {},
        finish: function () { return Promise.resolve(); }, abort: function () {},
      };
    }

    var el = buildDOM();
    var phaseEl, subEl, hexEl, vecEl;
    var timers = [], hexTimer = null, vecTimer = null;
    var startedAt = 0, mounted = false, vec = 0;

    function setPhase(p) {
      if (phaseEl) phaseEl.textContent = p.label;
      if (subEl) subEl.textContent = p.sub;
    }

    function mount() {
      if (mounted) return;
      frameEl.appendChild(el);
      phaseEl = el.querySelector('.scan-phase');
      subEl   = el.querySelector('.scan-sub');
      hexEl   = el.querySelector('.js-hex');
      vecEl   = el.querySelector('.js-vec');
      mounted = true;
    }

    function start() {
      mount();
      startedAt = Date.now();
      requestAnimationFrame(function () { el.classList.add('is-active'); });

      if (reduceMotion) {
        setPhase({ label: 'Analyzing photo', sub: 'Detecting and comparing the face' });
        if (vecEl) vecEl.textContent = '128 / 128';
        return;
      }

      PHASES.forEach(function (p) {
        timers.push(setTimeout(function () { setPhase(p); }, p.t));
      });
      // Cycling descriptor hex + climbing vector counter (decorative, staged).
      hexTimer = setInterval(function () {
        if (hexEl) hexEl.textContent = '0x' + rand16(8);
      }, 220);
      vecTimer = setInterval(function () {
        vec = Math.min(128, vec + Math.floor(Math.random() * 7) + 1);
        if (vecEl) vecEl.textContent = pad3(vec) + ' / 128';
      }, 90);
    }

    // Called the moment fetch() begins, mirroring the original
    // setStatus('info','Comparing…'). Advances the HUD and stops the
    // descriptor-extraction tickers (extraction is done by now).
    function compare() {
      if (reduceMotion) return;
      timers.forEach(clearTimeout);
      timers = [];
      if (hexTimer) { clearInterval(hexTimer); hexTimer = null; }
      if (vecTimer) { clearInterval(vecTimer); vecTimer = null; }
      if (vecEl) vecEl.textContent = '128 / 128';
      setPhase(COMPARE);
    }

    function clearAllTimers() {
      timers.forEach(clearTimeout); timers = [];
      if (hexTimer) { clearInterval(hexTimer); hexTimer = null; }
      if (vecTimer) { clearInterval(vecTimer); vecTimer = null; }
    }

    // Resolves after BOTH the caller's work is done (caller awaits this AFTER its
    // own awaits) AND MIN_DURATION has elapsed, then fades + removes the overlay.
    function finish() {
      var elapsed = Date.now() - startedAt;
      var wait = Math.max(0, MIN_DURATION - elapsed);
      return new Promise(function (resolve) {
        setTimeout(function () {
          clearAllTimers();
          setPhase(FINAL);
          var fade = reduceMotion ? 0 : 280;
          el.classList.remove('is-active');
          setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
            mounted = false;
            resolve();
          }, fade);
        }, wait);
      });
    }

    // Immediate teardown for errors (e.g. no face found).
    function abort() {
      clearAllTimers();
      el.classList.remove('is-active');
      if (el.parentNode) el.parentNode.removeChild(el);
      mounted = false;
    }

    return { start: start, compare: compare, finish: finish, abort: abort };
  }

  window.createScanOverlay = createScanOverlay;
})();
