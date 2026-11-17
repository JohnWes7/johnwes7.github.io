(function () {
  'use strict';

  /* ── Language toggle ─────────────────────────────── */
  var root = document.documentElement;
  var toggle = document.getElementById('langToggle');

  function setLang(l) {
    root.setAttribute('data-lang', l);
    root.lang = l === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem('lang', l); } catch (e) {}
    // Wires are positioned from node boxes, and text length changes with language.
    requestAnimationFrame(drawWires);
  }
  toggle.addEventListener('click', function () {
    setLang(root.getAttribute('data-lang') === 'zh' ? 'en' : 'zh');
  });

  /* ── Pipeline animation ──────────────────────────── */
  var pipe = document.getElementById('pipe');
  var svg = pipe.querySelector('.wires');
  var nodes = Array.prototype.slice.call(pipe.querySelectorAll('.node'));
  var packet = pipe.querySelector('.packet');
  var btn = document.getElementById('sendBtn');
  var log = document.getElementById('log');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  var centers = [];
  var segments = [];   // SVG path per hop
  var running = false;

  function measure() {
    var box = pipe.getBoundingClientRect();
    centers = nodes.map(function (n) {
      var r = n.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    });
  }

  // Orthogonal route between two node centres: straight if aligned, otherwise an elbow.
  function route(a, b) {
    if (Math.abs(a.y - b.y) < 2 || Math.abs(a.x - b.x) < 2) {
      return [a, b];
    }
    var midY = (a.y + b.y) / 2;
    return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
  }

  function drawWires() {
    measure();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    segments = [];
    for (var i = 0; i < centers.length - 1; i++) {
      var pts = route(centers[i], centers[i + 1]);
      var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
      segments.push(path);
    }
  }

  var files = ['trapcam-0412.jpg', 'trapcam-0977.mp4', 'gully-cam-031.jpg', 'yard-cam-118.jpg', 'creek-cam-205.jpg'];
  var species = ['red fox', 'feral cat', 'eastern grey kangaroo', 'common brushtail possum', 'domestic dog', 'superb lyrebird'];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function hex(n) { var s = ''; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function stamp() {
    var d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':');
  }

  var MAX_LINES = 6;
  function write(html) {
    var line = document.createElement('div');
    line.innerHTML = '<span class="t">' + stamp() + '</span>  ' + html;
    log.appendChild(line);
    while (log.children.length > MAX_LINES) log.removeChild(log.firstChild);
  }

  function steps(f, s, conf) {
    return [
      'upload    ' + esc(f) + '  sha256 ' + hex(8) + '… new, presigned PUT',
      's3        object created  media/' + esc(f),
      'events    rule matched, forward to queue',
      'sqs       message queued  (dead-letter queue on failure)',
      'lambda    call Cloud Run  OAuth token, JWKS verified',
      'cloudrun  MegaDetector animal ' + conf + '  SpeciesNet <span class="hl">' + esc(s) + '</span>',
      'dynamodb  indexed  species=<span class="hl">' + esc(s) + '</span>  <span class="ok">done</span>'
    ];
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function travel(i, ms) {
    var path = segments[i];
    if (!path) return Promise.resolve();
    var len = path.getTotalLength();
    path.classList.add('trail');
    return new Promise(function (resolve) {
      var t0 = null;
      function frame(t) {
        if (t0 === null) t0 = t;
        var k = Math.min((t - t0) / ms, 1);
        var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
        var p = path.getPointAtLength(len * e);
        packet.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        if (k < 1) requestAnimationFrame(frame);
        else { path.classList.remove('trail'); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  function heat(i) {
    nodes.forEach(function (n, k) { n.classList.toggle('hot', k === i); });
  }

  function run() {
    if (running) return Promise.resolve();
    running = true;
    btn.disabled = true;
    drawWires();

    var f = pick(files);
    var s = pick(species);
    var conf = (0.86 + Math.random() * 0.13).toFixed(2);
    var lines = steps(f, s, conf);
    var still = reduce.matches;
    var chain = Promise.resolve();

    if (!still) {
      packet.style.opacity = '1';
      packet.style.transform = 'translate(' + centers[0].x + 'px,' + centers[0].y + 'px)';
    }

    lines.forEach(function (line, i) {
      chain = chain.then(function () {
        heat(i);
        write(line);
        if (i === lines.length - 1) return wait(still ? 300 : 700);
        return still ? wait(260) : wait(220).then(function () { return travel(i, 520); });
      });
    });

    return chain.then(function () {
      heat(-1);
      packet.style.opacity = '0';
      running = false;
      btn.disabled = false;
    });
  }

  btn.addEventListener('click', function () { run(); });

  // Ambient runs while the diagram is on screen; never with reduced motion.
  var visible = false;
  var timer = null;
  function schedule() {
    clearTimeout(timer);
    if (reduce.matches) return;
    timer = setTimeout(function () {
      if (visible && !document.hidden && !running) run().then(schedule);
      else schedule();
    }, 4200);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { threshold: 0.4 }).observe(pipe);
  } else {
    visible = true;
  }

  var resizeQueued = false;
  window.addEventListener('resize', function () {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () { resizeQueued = false; drawWires(); });
  });

  function start() {
    drawWires();
    write('<span class="ok">ready</span>  waiting for camera uploads');
    if (!reduce.matches) setTimeout(function () { run().then(schedule); }, 900);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else window.addEventListener('load', start);
})();
