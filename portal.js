/* DIVYANSH portal: letter animation, mouse parallax, golden embers and the door-opening sequence.
 * Plain script, no libraries. Destination comes from portal-config.js. */
(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  var stage = document.getElementById('stage');
  var portal = document.getElementById('portal');
  var canvas = document.getElementById('embers');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var config = window.PORTAL_CONFIG || { FUTURE_SITE_URL: '/' };

  // Remember that this browser tab has been through the portal, so the app does not send it back here
  function markSeen() {
    try { sessionStorage.setItem('et_portal_seen', '1'); } catch (e) { /* storage blocked */ }
  }

  // ------------------------------------------------------------------ wordmark letters
  (function splitWordmark() {
    var word = document.querySelector('.brand-word');
    if (!word) return;
    var text = word.textContent.trim();
    word.textContent = '';
    for (var i = 0; i < text.length; i++) {
      var ch = document.createElement('span');
      ch.className = 'ch';
      ch.style.setProperty('--i', i);
      ch.textContent = text[i];
      word.appendChild(ch);
    }
  })();

  // ------------------------------------------------------------------ parallax
  var target = { x: 0, y: 0 };
  var current = { x: 0, y: 0 };
  var parallaxRunning = false;

  function onPointerMove(e) {
    if (reduceMotion) return;
    target.x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1));
    target.y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1));
    if (!parallaxRunning) { parallaxRunning = true; requestAnimationFrame(stepParallax); }
  }

  function stepParallax() {
    current.x += (target.x - current.x) * 0.08;
    current.y += (target.y - current.y) * 0.08;
    root.style.setProperty('--mx', current.x.toFixed(4));
    root.style.setProperty('--my', current.y.toFixed(4));
    if (Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001) {
      requestAnimationFrame(stepParallax);
    } else {
      parallaxRunning = false;
    }
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // ------------------------------------------------------------------ embers
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var particles = [];
  var mode = 'idle'; // idle | hover | opening
  var MODES = {
    idle: { count: 52, speed: 1 },
    hover: { count: 110, speed: 1.8 },
    opening: { count: 220, speed: 3.2 },
  };
  var COLORS = [
    [247, 231, 206], // champagne
    [255, 191, 90], // amber
    [255, 255, 240], // radiant ivory
    [255, 214, 140], // warm gold
  ];
  var W = 0;
  var H = 0;
  var dpr = 1;
  var lastTime = 0;
  var rafId = 0;

  function resize() {
    if (!ctx) return;
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // The door's box in stage pixels (matches the CSS variables in portal.css)
  function door() {
    return { cx: W * 0.502, top: H * (0.57 - 0.1085), bottom: H * (0.57 + 0.1085), w: W * 0.072 };
  }

  function spawn(fresh) {
    var d = door();
    var spread = d.w * (mode === 'opening' ? 2.2 : 1.1);
    var scale = H / 900;
    return {
      x: d.cx + (Math.random() - 0.5) * spread * 2,
      y: fresh ? d.bottom - Math.random() * (d.bottom - d.top) * 1.2 : d.bottom - Math.random() * (d.bottom - d.top) * 0.35,
      vy: -(12 + Math.random() * 22) * scale,
      vx: (Math.random() - 0.5) * 6 * scale,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.8 + Math.random() * 1.6,
      wobbleSize: (4 + Math.random() * 10) * scale,
      size: (0.6 + Math.random() * 1.7) * Math.max(scale, 0.6),
      life: 0,
      maxLife: 3 + Math.random() * 4.5,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    };
  }

  function draw(p, alpha) {
    var c = p.color;
    var x = p.x + Math.sin(p.wobble) * p.wobbleSize;
    ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha * 0.18).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, p.y, p.size * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(time) {
    rafId = requestAnimationFrame(frame);
    var dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0.016;
    lastTime = time;
    var m = MODES[mode];
    while (particles.length < m.count) particles.push(spawn(particles.length < m.count * 0.5 && time < 1500));
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      p.wobble += p.wobbleSpeed * dt;
      p.x += p.vx * dt * m.speed;
      p.y += p.vy * dt * m.speed;
      var t = p.life / p.maxLife;
      if (t >= 1 || p.y < 0) {
        if (particles.length > m.count) particles.splice(i, 1);
        else particles[i] = spawn(false);
        continue;
      }
      var alpha = Math.sin(Math.PI * t) * (mode === 'opening' ? 1 : 0.85); // fade in, then out
      draw(p, alpha);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStill() {
    // Reduced motion: a quiet scattering of embers, drawn once
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 30; i++) { var p = spawn(true); draw(p, 0.5 + Math.random() * 0.4); }
    ctx.globalCompositeOperation = 'source-over';
  }

  function start() {
    if (!ctx) return;
    resize();
    if (reduceMotion) { drawStill(); return; }
    cancelAnimationFrame(rafId);
    lastTime = 0;
    rafId = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', function () {
    resize();
    if (reduceMotion) drawStill();
  });
  document.addEventListener('visibilitychange', function () {
    if (!ctx || reduceMotion) return;
    if (document.hidden) cancelAnimationFrame(rafId);
    else { lastTime = 0; rafId = requestAnimationFrame(frame); }
  });

  // ------------------------------------------------------------------ hover and focus
  var opening = false;
  function setHover(on) {
    if (opening) return;
    root.style.setProperty('--hover', on ? '1' : '0');
    mode = on ? 'hover' : 'idle';
  }
  portal.addEventListener('pointerenter', function () { setHover(true); });
  portal.addEventListener('pointerleave', function () { if (document.activeElement !== portal) setHover(false); });
  portal.addEventListener('focus', function () { setHover(true); });
  portal.addEventListener('blur', function () { setHover(false); });

  // ------------------------------------------------------------------ opening sequence
  // 0-1000 ms: the leaf swings open, light erupts, the camera moves into the doorway.
  // 1100 ms: white-gold flash. 1800 ms: on to the destination.
  function enter() {
    if (opening) return;
    opening = true;
    markSeen();
    root.style.setProperty('--hover', '1');
    mode = 'opening';
    portal.setAttribute('aria-disabled', 'true');
    var flashAt = reduceMotion ? 0 : 1100;
    var leaveAt = reduceMotion ? 350 : 1800;
    if (!reduceMotion) body.classList.add('is-opening');
    setTimeout(function () { body.classList.add('is-flashing'); }, flashAt);
    setTimeout(function () { window.location.assign(config.FUTURE_SITE_URL); }, leaveAt);
  }
  // A <button> already answers to Enter and Space from the keyboard
  portal.addEventListener('click', enter);

  // Coming back with the browser's Back button: show the closed door again
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    opening = false;
    body.classList.remove('is-opening', 'is-flashing');
    portal.removeAttribute('aria-disabled');
    setHover(false);
    start();
  });

  start();
})();
