(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function lang() { return root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en'; }

  // Calls back with true once at least `threshold` of the element is on screen, false when it drops below.
  function watch(el, cb, threshold) {
    var t = threshold || 0;
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { cb(e.isIntersecting && e.intersectionRatio >= t * 0.99); });
    }, { threshold: t }).observe(el);
  }

  // Autoplay whose progress is drawn in the active page dot (--fill, 0 to 1).
  // It pauses in place while off screen or in a background tab and resumes from the same
  // point; once the visitor takes control it stops for good and the dot shows as full.
  function autoplay(interval, next, activeDot) {
    var elapsed = 0, last = null, raf = null, stopped = false, visible = false;
    function canRun() { return !stopped && visible && !document.hidden && !reduce.matches; }
    function paint() {
      var d = activeDot();
      if (!d) return;
      var f = (stopped || reduce.matches) ? 1 : Math.min(elapsed / interval, 1);
      d.style.setProperty('--fill', f.toFixed(3));
    }
    function frame(t) {
      raf = null;
      if (!canRun()) { last = null; return; }
      if (last !== null) elapsed += Math.min(t - last, 100); // a long gap (e.g. a hiccup) shouldn't skip ahead
      last = t;
      if (elapsed >= interval) { elapsed = 0; next(); }
      paint();
      raf = requestAnimationFrame(frame);
    }
    function kick() {
      paint();
      if (!raf && canRun()) { last = null; raf = requestAnimationFrame(frame); }
    }
    document.addEventListener('visibilitychange', kick);
    return {
      visible: function (v) { visible = v; kick(); },
      restart: function () { elapsed = 0; paint(); },
      stop: function () { stopped = true; paint(); }
    };
  }

  // Shared by galleries and the phone carousel: mark the active dot, clear the others.
  function markDots(dots, a, attr) {
    dots.forEach(function (d, k) {
      d.classList.toggle('is-active', k === a);
      d.setAttribute(attr, k === a ? 'true' : 'false');
      if (k !== a) d.style.setProperty('--fill', '0');
    });
  }

  /* ── Language toggle ──────────────────────────────────── */
  var redrawWires = function () {};
  $('#langToggle').addEventListener('click', function () {
    var l = lang() === 'zh' ? 'en' : 'zh';
    root.setAttribute('data-lang', l);
    root.lang = l === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem('lang', l); } catch (e) {}
    if (lightbox.open && lbData) lbCap.textContent = captionFor(lbData);
    requestAnimationFrame(redrawWires);
    document.dispatchEvent(new Event('langchange'));
  });

  /* ── Lightbox ─────────────────────────────────────────── */
  var lightbox = $('#lightbox');
  var lbImg = $('img', lightbox);
  var lbCap = $('.lb-cap', lightbox);
  var lbData = null;
  function captionFor(d) { return lang() === 'zh' ? (d.zh || d.en || '') : (d.en || ''); }
  function openLightbox(src, en, zh) {
    if (typeof lightbox.showModal !== 'function') { window.open(src, '_blank', 'noopener'); return; }
    lbData = { en: en, zh: zh };
    lbImg.src = src;
    lbImg.alt = en || '';
    lbCap.textContent = captionFor(lbData);
    lightbox.showModal();
  }
  $('.lb-close', lightbox).addEventListener('click', function () { lightbox.close(); });
  lightbox.addEventListener('click', function (e) { if (e.target === lightbox) lightbox.close(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-zoom]');
    if (t) openLightbox(t.getAttribute('data-zoom'), t.getAttribute('data-cap-en'), t.getAttribute('data-cap-zh'));
  });

  /* ── Top bar state ────────────────────────────────────── */
  var bar = $('#bar');
  function updateBar() { bar.classList.toggle('scrolled', window.scrollY > 8); }

  /* ── Scroll-linked progress (--p) and section glows ───── */
  var progEls = $$('[data-p]');
  function updateProgress() {
    var vh = window.innerHeight;
    progEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var p = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.7)));
      el.style.setProperty('--p', p.toFixed(3));
    });
  }
  progEls.forEach(function (el) {
    watch(el, function (v) { if (v) el.classList.add('in'); }, 0.15);
  });
  if (reduce.matches) progEls.forEach(function (el) { el.style.setProperty('--p', '1'); });

  var scrollQueued = false;
  window.addEventListener('scroll', function () {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(function () {
      scrollQueued = false;
      updateBar();
      if (!reduce.matches) updateProgress();
    });
  }, { passive: true });
  updateBar();
  if (!reduce.matches) updateProgress();

  /* ── Image galleries (browser frames, the energy card) ── */
  $$('[data-gallery]').forEach(function (g) {
    var slides = $$('.slide', g);
    var caps = $$('.cap', g);
    var dotsWrap = $('.g-dots', g);
    var view = $('.view', g);
    var n = slides.length, a = 0;

    var dots = slides.map(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-dot';
      b.setAttribute('aria-label', 'Show image ' + (i + 1) + ' of ' + n);
      b.addEventListener('click', function (e) { e.stopPropagation(); auto.stop(); go(i); });
      dotsWrap.appendChild(b);
      return b;
    });
    var auto = autoplay(5000, function () { go(a + 1); }, function () { return dots[a]; });
    if (n < 2) auto.stop();

    function go(i) {
      a = (i + n) % n;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === a); });
      caps.forEach(function (c, k) { c.classList.toggle('is-active', k === a); });
      markDots(dots, a, 'aria-current');
      auto.restart();
    }

    view.setAttribute('role', 'button');
    view.setAttribute('tabindex', '0');
    view.setAttribute('aria-label', 'Enlarge image');
    function zoom() {
      var s = slides[a];
      auto.stop();
      openLightbox(s.currentSrc || s.src, s.alt, s.getAttribute('data-cap-zh'));
    }
    view.addEventListener('click', zoom);
    view.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoom(); } });

    watch(g, auto.visible, 0.35);
    go(0);
  });

  /* ── Phone carousel (steaL) ───────────────────────────── */
  $$('[data-phones]').forEach(function (box) {
    var phones = $$('.phone', box);
    var caps = $$('.cap', box);
    var stage = $('.phone-stage', box);
    var dotsWrap = $('.car-dots', box);
    var n = phones.length, a = 0;

    var dots = phones.map(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-dot';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { user(i); });
      dotsWrap.appendChild(b);
      return b;
    });
    var auto = autoplay(4200, function () { go(a + 1); }, function () { return dots[a]; });

    function label() {
      dots.forEach(function (b, i) {
        var t = $('[data-l="' + lang() + '"]', caps[i]);
        b.setAttribute('aria-label', t ? t.textContent : 'Screen ' + (i + 1));
      });
    }
    document.addEventListener('langchange', label);

    function layout() {
      phones.forEach(function (p, i) {
        var o = (i - a + n) % n;
        var pos = o === 0 ? 'center' : o === 1 ? 'right' : o === n - 1 ? 'left' : 'back';
        p.setAttribute('data-pos', pos);
        p.setAttribute('aria-hidden', pos === 'center' ? 'false' : 'true');
      });
      caps.forEach(function (c, i) { c.classList.toggle('is-active', i === a); });
      markDots(dots, a, 'aria-selected');
    }
    function go(i) { a = (i + n) % n; layout(); auto.restart(); }
    function user(i) { auto.stop(); go(i); }

    // Swipe left/right on touch screens; a swipe shouldn't also count as a tap.
    var sx = null, sy = null, swiped = false;
    stage.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; swiped = false; });
    stage.addEventListener('pointercancel', function () { sx = null; });
    stage.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = true; user(dx < 0 ? a + 1 : a - 1); }
    });

    phones.forEach(function (p, i) {
      p.addEventListener('click', function () {
        if (swiped) { swiped = false; return; }
        if (p.getAttribute('data-pos') === 'center') {
          var img = $('img', p);
          auto.stop();
          openLightbox(img.currentSrc || img.src, img.alt, null);
        } else {
          user(i);
        }
      });
    });
    $('.prev', box).addEventListener('click', function () { user(a - 1); });
    $('.next', box).addEventListener('click', function () { user(a + 1); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); user(a - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); user(a + 1); }
    });
    watch(box, auto.visible, 0.4);

    // Subtle tilt toward the pointer, eased so it feels physical.
    if (finePointer.matches && !reduce.matches) {
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
      var step = function () {
        cx += (tx - cx) * 0.08;
        cy += (ty - cy) * 0.08;
        stage.style.transform = 'rotateX(' + cx.toFixed(2) + 'deg) rotateY(' + cy.toFixed(2) + 'deg)';
        raf = (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) ? requestAnimationFrame(step) : null;
      };
      box.addEventListener('pointermove', function (e) {
        var r = box.getBoundingClientRect();
        tx = ((e.clientY - r.top) / r.height - 0.5) * -7;
        ty = ((e.clientX - r.left) / r.width - 0.5) * 12;
        if (!raf) raf = requestAnimationFrame(step);
      });
      box.addEventListener('pointerleave', function () {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(step);
      });
    }
    label();
    go(0);
  });

  /* ── steaL repo map: one folder open at a time ────────── */
  $$('[data-repo]').forEach(function (box) {
    var dirs = $$('.repo-dir', box);
    function set(btn, open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.closest('.repo-cell').classList.toggle('is-open', open);
      document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
    }
    dirs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') !== 'true';
        dirs.forEach(function (b) { set(b, false); });
        if (open) set(btn, true);
      });
      // The whole cell opens its folder, not only the name (but selecting text there shouldn't).
      btn.closest('.repo-cell').addEventListener('click', function (e) {
        if (e.target.closest('button, a') || String(window.getSelection())) return;
        btn.click();
      });
    });
  });

  /* ── Card spotlight ───────────────────────────────────── */
  if (finePointer.matches) {
    $$('.card').forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ── Co-edit illustration (Agencia) ───────────────────── */
  (function () {
    var box = $('#coedit');
    if (!box) return;
    var fields = $$('.ce-field', box);
    var texts = fields.map(function (f) { return $('.ce-text', f); });
    var saved = $('.ce-saved', box);
    var START = ['Move customer support to the new help portal', 'Support team, 40 people', ''];

    function makeCaret(cls, name) {
      var c = document.createElement('span');
      c.className = 'caret ' + cls;
      c.setAttribute('data-name', name);
      return c;
    }
    var you = makeCaret('y', 'Yijiang');
    var mate = makeCaret('t', 'Teammate');
    function place(c, i) { texts[i].parentNode.appendChild(c); }
    function flash(i, who) {
      var f = fields[i];
      f.classList.add('sync-' + who);
      clearTimeout(f['_t' + who]);
      f['_t' + who] = setTimeout(function () { f.classList.remove('sync-' + who); }, 420);
    }
    function settle(c) {
      c.classList.remove('typing');
      c.classList.add('recent');
      clearTimeout(c._idle);
      c._idle = setTimeout(function () { c.classList.remove('recent'); }, 1600);
    }
    function type(i, str, who, c) {
      place(c, i);
      c.classList.add('typing');
      return new Promise(function (done) {
        var k = 0;
        (function next() {
          if (k >= str.length) { settle(c); done(); return; }
          texts[i].textContent += str.charAt(k++);
          flash(i, who);
          setTimeout(next, 45 + Math.random() * 75);
        })();
      });
    }
    function erase(i, count, who, c) {
      place(c, i);
      c.classList.add('typing');
      return new Promise(function (done) {
        var k = 0;
        (function next() {
          if (k >= count) { settle(c); done(); return; }
          texts[i].textContent = texts[i].textContent.slice(0, -1);
          k++;
          flash(i, who);
          setTimeout(next, 45);
        })();
      });
    }
    function reset() {
      texts.forEach(function (t, i) { t.textContent = START[i]; });
      place(you, 0);
      place(mate, 1);
      saved.textContent = 'All changes synced';
    }

    if (reduce.matches) {
      texts[0].textContent = START[0] + ' by July';
      texts[1].textContent = 'Support team, 42 people across 3 sites';
      texts[2].textContent = 'Run two training sessions before launch';
      place(you, 1);
      place(mate, 2);
      return;
    }

    var inView = false;
    watch(box, function (v) { inView = v; }, 0.3);

    function cycle() {
      reset();
      return wait(900).then(function () {
        saved.textContent = 'Syncing…';
        var teammate = wait(300).then(function () {
          return type(2, 'Run two training sessions before launch', 't', mate);
        });
        var me = wait(1100)
          .then(function () { return erase(1, 9, 'y', you); })
          .then(function () { return type(1, '42 people across 3 sites', 'y', you); })
          .then(function () { return wait(450); })
          .then(function () { return type(0, ' by July', 'y', you); });
        return Promise.all([teammate, me]);
      }).then(function () {
        saved.textContent = 'All changes synced';
        return wait(3400);
      });
    }
    function loop() {
      var next = (inView && !document.hidden) ? cycle() : wait(500);
      next.then(loop);
    }
    reset();
    loop();
  })();

  /* ── Pipeline animation (hero) ────────────────────────── */
  (function () {
    var pipe = $('#pipe');
    if (!pipe) return;
    var svg = $('.wires', pipe);
    var nodes = $$('.node', pipe);
    var packet = $('.packet', pipe);
    var btn = $('#sendBtn');
    var log = $('#log');
    var ghosts = [0, 1, 2, 3].map(function () {
      var g = document.createElement('span');
      g.className = 'pipe-ghost';
      g.setAttribute('aria-hidden', 'true');
      pipe.appendChild(g);
      return g;
    });

    var centers = [], segments = [], running = false;

    function measure() {
      var box = pipe.getBoundingClientRect();
      centers = nodes.map(function (n) {
        var r = n.getBoundingClientRect();
        return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
      });
    }
    // Orthogonal route between two node centres: straight if aligned, otherwise an elbow.
    function route(a, b) {
      if (Math.abs(a.y - b.y) < 2 || Math.abs(a.x - b.x) < 2) return [a, b];
      var midY = (a.y + b.y) / 2;
      return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
    }
    function drawWires() {
      measure();
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      segments = [];
      for (var i = 0; i < centers.length - 1; i++) {
        var d = route(centers[i], centers[i + 1]).map(function (p, k) {
          return (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        segments.push(path);
      }
    }
    redrawWires = drawWires;

    var files = ['trapcam-0412.jpg', 'trapcam-0977.mp4', 'gully-cam-031.jpg', 'yard-cam-118.jpg', 'creek-cam-205.jpg'];
    var species = ['red fox', 'feral cat', 'eastern grey kangaroo', 'common brushtail possum', 'domestic dog', 'superb lyrebird'];
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function hex(n) { var s = ''; while (s.length < n) s += Math.floor(Math.random() * 16).toString(16); return s; }
    function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
    function stamp() {
      var d = new Date();
      return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':');
    }
    function write(html) {
      var line = document.createElement('div');
      line.innerHTML = '<span class="t">' + stamp() + '</span>  ' + html;
      log.appendChild(line);
      while (log.children.length > 6) log.removeChild(log.firstChild);
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
    function setDot(el, x, y, o) {
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      el.style.opacity = o;
    }
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
          setDot(packet, p.x, p.y, 1);
          ghosts.forEach(function (g, j) {
            var ge = Math.max(0, e - (j + 1) * 0.055);
            var gp = path.getPointAtLength(len * ge);
            setDot(g, gp.x, gp.y, k < 1 ? (0.5 - j * 0.11) : 0);
          });
          if (k < 1) requestAnimationFrame(frame);
          else { path.classList.remove('trail'); resolve(); }
        }
        requestAnimationFrame(frame);
      });
    }
    function heat(i) { nodes.forEach(function (n, k) { n.classList.toggle('hot', k === i); }); }

    function run() {
      if (running) return Promise.resolve();
      running = true;
      btn.disabled = true;
      drawWires();
      var lines = steps(pick(files), pick(species), (0.86 + Math.random() * 0.13).toFixed(2));
      var still = reduce.matches;
      var chain = Promise.resolve();
      if (!still) setDot(packet, centers[0].x, centers[0].y, 1);
      lines.forEach(function (line, i) {
        chain = chain.then(function () {
          heat(i);
          write(line);
          if (i === lines.length - 1) return wait(still ? 300 : 700);
          return still ? wait(260) : wait(200).then(function () { return travel(i, 540); });
        });
      });
      return chain.then(function () {
        heat(-1);
        packet.style.opacity = '0';
        ghosts.forEach(function (g) { g.style.opacity = '0'; });
        running = false;
        btn.disabled = false;
      });
    }
    btn.addEventListener('click', function () { run(); });

    // Ambient runs while the diagram is on screen; never with reduced motion.
    var visible = false, timer = null;
    function schedule() {
      clearTimeout(timer);
      if (reduce.matches) return;
      timer = setTimeout(function () {
        if (visible && !document.hidden && !running) run().then(schedule);
        else schedule();
      }, 4200);
    }
    watch(pipe, function (v) { visible = v; }, 0.4);

    var resizeQueued = false;
    window.addEventListener('resize', function () {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(function () { resizeQueued = false; drawWires(); });
    });

    function start() {
      drawWires();
      write('<span class="ok">ready</span>  waiting for camera uploads');
      // Let the hero's entrance finish before the first packet goes out.
      if (!reduce.matches) setTimeout(function () { run().then(schedule); }, 1500);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
    else window.addEventListener('load', start);
  })();
})();
