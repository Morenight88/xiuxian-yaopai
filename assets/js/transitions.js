/* ══════════════════════════════════════════════════════════════════════
   修仙也要拍 · 過場動畫引擎 (transitions.js)
   開場飛劍＋霸氣文字 / 水滴漣漪 / 飛劍掠過 / 角色專屬過場（雲端影片或內建特效）
   全部只用 transform + opacity + canvas，保持 60fps 順暢。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = window.XX_CONFIG;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var fx = {}, canvas = null, ctx = null, raf = 0, parts = [], dpr = 1;
  var videoMap = {};
  var reduce = function () {
    if (CFG.motion.reduceMotion === 'off') return false;
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  var M = function (ms) { return reduce() ? Math.round(ms * 0.3) : ms; };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, M(ms)); }); };
  /* 作者可在 config 關掉全部動畫；網頁卡住時網站也會自動關掉 */
  var calm = function () { return CFG.motion.enabled === false; };
  var ambientOn = true;

  /* 把畫面還給使用者：強制結束所有覆蓋層（卡住救援用）*/
  function killAll() {
    try { if (raf) { cancelAnimationFrame(raf); raf = 0; } } catch (e) { }
    parts = [];
    try { if (ctx) ctx.clearRect(0, 0, innerWidth, innerHeight); } catch (e) { }
    var root = $('#intro');
    if (root) { root.hidden = true; root.classList.remove('is-sword', 'is-skip', 'fade-out'); }
    document.body.classList.remove('intro-running');
    if (fx.root) {
      fx.root.hidden = true;
      fx.root.classList.remove('fx-on', 'is-wet', 'fade-out');
      show(fx.drop, false); show(fx.ripples, false); show(fx.center, false); show(fx.sweep, false);
      if (fx.ripples) fx.ripples.innerHTML = '';
      if (fx.video) { try { fx.video.pause(); } catch (e) { } fx.video.removeAttribute('src'); try { fx.video.load(); } catch (e) { } show(fx.video, false); }
    }
    skipFn = null;
  }

  function initDom() {
    if (fx.root) return;
    fx.root = $('#fx'); fx.drop = $('#fx-drop'); fx.ripples = $('#fx-ripples');
    fx.sweep = $('#fx-sweep'); canvas = $('#fx-canvas'); fx.center = $('#fx-center');
    fx.video = $('#fx-video'); fx.fade = $('#fx-fade');
    if (canvas) { ctx = canvas.getContext('2d'); sizeCanvas(); window.addEventListener('resize', sizeCanvas, { passive: true }); }
  }
  function sizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function show(el, on) { if (el) el.hidden = !on; }
  function cls(el, name, on) { if (el) el.classList.toggle(name, !!on); }

  /* ── canvas 粒子系統 ── */
  function loop() {
    if (raf) return;
    var step = function () {
      if (!parts.length) { raf = 0; if (ctx) ctx.clearRect(0, 0, innerWidth, innerHeight); return; }
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter(function (p) { return p.life > 0; });
      for (var i = 0; i < parts.length; i++) draw(parts[i]);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function draw(p) {
    if (p.delay > 0) { p.delay -= 1; return; }
    p.life -= 1;
    if (p.upd) p.upd(p);
    if (p.grow) p.r += p.grow;
    if (p.shrink) p.r = Math.max(0.2, p.r - p.shrink);
    if (p.vx) p.x += p.vx;
    if (p.vy) p.vy += 0, p.y += p.vy;
    if (p.grav) p.vy += p.grav;
    if (p.spin) p.rot = (p.rot || 0) + p.spin;
    if (p.sway) p.x += Math.sin((p.max - p.life) / 7) * p.sway;
    var a = Math.max(0, Math.min(1, p.life / p.max));
    ctx.save();
    ctx.globalAlpha = a * (p.alpha || 1);
    ctx.translate(p.x, p.y);
    if (p.rot) ctx.rotate(p.rot);
    if (p.type === 'glyph') {
      ctx.font = p.size + 'px "Noto Serif TC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 18; }
      ctx.fillText(p.ch, 0, 0);
    } else if (p.type === 'ring') {
      ctx.strokeStyle = p.color; ctx.lineWidth = p.w || 2;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.stroke();
    } else if (p.type === 'streak') {
      var g = ctx.createLinearGradient(-p.len, 0, p.len, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(.6, p.color);
      g.addColorStop(1, '#fff');
      ctx.fillStyle = g;
      ctx.fillRect(-p.len, -p.thick / 2, p.len * 2, p.thick);
    } else if (p.type === 'blob') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'bolt') {
      ctx.strokeStyle = p.color; ctx.lineWidth = p.w || 2; ctx.lineCap = 'round';
      ctx.beginPath();
      var x = 0, y = -p.h / 2;
      ctx.moveTo(x, y);
      for (var k = 0; k < p.seg; k++) { x += (Math.random() - .5) * 34; y += p.h / p.seg; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function P(o) {
    o.max = o.max || 60; o.life = o.life || o.max; o.delay = o.delay || 0;
    parts.push(o); loop();
    return o;
  }
  function clearParts() { parts = []; if (ctx) ctx.clearRect(0, 0, innerWidth, innerHeight); }

  /* ── 背景靈氣粒子（常駐，很淡）── */
  function ambient() {
    var c = $('#bg-canvas');
    if (!c || reduce()) return;
    var g = c.getContext('2d'), w = 0, h = 0, motes = [], d = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      w = innerWidth; h = innerHeight;
      c.width = w * d; c.height = h * d;
      c.style.width = w + 'px'; c.style.height = h + 'px';
      g.setTransform(d, 0, 0, d, 0, 0);
    }
    size(); window.addEventListener('resize', size, { passive: true });
    for (var i = 0; i < 46; i++) motes.push(newMote(w, h, true));
    function newMote(w, h, seed) {
      return { x: Math.random() * w, y: seed ? Math.random() * h : h + 12,
        r: .6 + Math.random() * 2.2, vy: .12 + Math.random() * .35, vx: (Math.random() - .5) * .18,
        a: .12 + Math.random() * .3, hue: Math.random() < .3 ? '196,209,165' : '230,194,107', ph: Math.random() * 6 };
    }
    (function tick() {
      if (!ambientOn) { g.clearRect(0, 0, w, h); return; }
      g.clearRect(0, 0, w, h);
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.y -= m.vy; m.x += m.vx + Math.sin((m.y + m.ph * 40) / 90) * .22;
        if (m.y < -10) motes[i] = newMote(w, h, false);
        g.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(Date.now() / 1400 + m.ph));
        g.fillStyle = 'rgba(' + m.hue + ',1)';
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, 6.284); g.fill();
      }
      g.globalAlpha = 1;
      requestAnimationFrame(tick);
    }());
  }

  /* ══════════ 1. 開場：飛劍掠過 ＋ 霸氣文字 ══════════
     char: 若玩家已選最愛角色且有影片 → 用該角色的過場影片＋文字
           否則使用預設飛劍動畫                                            */
  var skipFn = null;
  function intro(charObj) {
    initDom();
    var root = $('#intro');
    if (!root) return Promise.resolve();
    if (calm()) {
      // 無動畫模式：品牌字直接出現，停一下再淡出
      var host0 = $('#intro-chars');
      if (host0) { host0.innerHTML = ''; String(window.I18N.brand()).split('').forEach(function (ch) { var s = document.createElement('span'); s.className = 'wch'; s.textContent = ch; host0.appendChild(s); }); }
      if ($('#intro-sub')) $('#intro-sub').textContent = window.I18N.t('intro.sub');
      root.hidden = false; root.classList.remove('is-sword');
      return wait(1000).then(function () { return fadeOut(root, 300); })
        .then(function () { root.hidden = true; document.body.classList.remove('intro-running'); });
    }
    var M_ = CFG.motion.intro;
    root.style.setProperty('--sword-dur', M(M_.sword) + 'ms');
    root.style.setProperty('--word-dur', M(M_.word) + 'ms');
    fx.root && fx.root.style.setProperty('--drop-fall', M(CFG.motion.waterDrop.fall) + 'ms');
    fx.root && fx.root.style.setProperty('--ripple-dur', M(CFG.motion.waterDrop.splash) + 'ms');
    fx.root && fx.root.style.setProperty('--sweep-dur', M(CFG.motion.swordPass.total) + 'ms');
    root.hidden = false;
    document.body.classList.add('intro-running');

    // 把品牌字切成一字一個 span，做出依序砸下的重量感
    var host = $('#intro-chars'), brand = window.I18N.brand();
    host.innerHTML = '';
    String(brand).split('').forEach(function (ch, i) {
      var s = document.createElement('span');
      s.className = 'wch'; s.textContent = ch;
      s.style.animationDelay = (M_.sword * 0.62 + i * 105) + 'ms';
      host.appendChild(s);
    });
    cls(root, 'is-sword', false); void root.offsetWidth;
    cls(root, 'is-sword', true);
    $('#intro-sub').textContent = window.I18N.t('intro.sub');

    // 劍氣劃過的火花粒子
    var sparkAt = M_.sword * 0.45;
    setTimeout(function () { qiStreaks(charObj ? charObj.c1 : '#bfe3ff', 26); }, M(sparkAt));

    return new Promise(function (res) {
      var done = false, timer = 0;
      function finish() {
        if (done) return; done = true; skipFn = null;
        if (timer) clearTimeout(timer);
        fadeOut(root, 620).then(function () {
          root.hidden = true; cls(root, 'is-sword', false);
          document.body.classList.remove('intro-running');
          clearParts();
          res();
        });
      }
      skipFn = function () { root.classList.add('is-skip'); finish(); };
      timer = setTimeout(finish, M(M_.sword + M_.word + M_.hold));
    });
  }
  function skipIntro() { if (skipFn) skipFn(); }

  /* ══════════ 2. 選擇語言 → 水滴落下 ＋ 漣漪 ══════════ */
  function waterDrop() {
    initDom();
    if (calm()) { killAll(); return Promise.resolve(false); }
    var root = fx.root, M_ = CFG.motion.waterDrop;
    show(root, true);
    cls(root, 'fx-on', true);
    show(fx.drop, true); show(fx.ripples, true);
    fx.ripples.innerHTML = '';
    cls(fx.drop, 'is-falling', false); void fx.drop.offsetWidth;
    cls(fx.drop, 'is-falling', true);

    return wait(M_.fall).then(function () {
      show(fx.drop, false);
      // 三層漣漪依序擴散
      for (var i = 0; i < 3; i++) {
        var r = document.createElement('i');
        r.className = 'ripple';
        r.style.animationDelay = (i * 190) + 'ms';
        fx.ripples.appendChild(r);
      }
      if (!reduce()) rippleBurstParts('#8fd7ff', 22);
      // 水波紋向上掀起整個畫面（霧化揭開）
      cls(root, 'is-wet', true);
      return wait(M_.splash);
    }).then(function () {
      cls(root, 'is-wet', false);
      show(fx.ripples, false);
      return wait(120);
    }).then(function () {
      // 收掉暗色覆蓋層：不然選完語言後整站會一直蒙在黑紗下（看起來就像卡住）
      cls(root, 'fx-on', false);
      clearParts();
      show(root, false);
    });
  }

  /* ══════════ 3. 建立帳號 → 飛劍掠過 ══════════ */
  function swordPass(color) {
    initDom();
    if (calm()) { killAll(); return Promise.resolve(false); }
    var root = fx.root;
    show(root, true); cls(root, 'fx-on', true);
    show(fx.sweep, true);
    fx.sweep.style.setProperty('--sweep-color', color || '#cfe9ff');
    cls(fx.sweep, 'is-passing', false); void fx.sweep.offsetWidth;
    cls(fx.sweep, 'is-passing', true);
    qiStreaks(color || '#cfe9ff', 34);
    return wait(CFG.motion.swordPass.total).then(function () {
      show(fx.sweep, false);
      clearParts();
      return wait(60);
    }).then(function () {
      // 一定要把暗色覆蓋層收掉，否則之後的畫面會一直蒙在一層黑紗下面
      cls(root, 'fx-on', false);
      show(fx.sweep, false);
      show(root, false);
    });
  }

  /* ══════════ 4. 角色過場：雲端影片優先，沒有影片就用內建特效 ══════════ */
  function character(charObj) {
    initDom();
    if (calm()) { killAll(); return Promise.resolve(false); }
    if (!charObj) return swordPass('#cfe9ff');
    var v = videoMap[charObj.id];
    var src = v && (v.directUrl || v.url || driveDirect(v.fileId));
    if (CFG.characterVideoFallback !== 'fx' && !src) return characterFx(charObj);
    if (!src) return characterFx(charObj);
    return playVideo(src).then(function (played) {
      if (played) return;
      return characterFx(charObj);
    });
  }
  function playVideo(src) {
    var v = fx.video, root = fx.root, M_ = CFG.motion.character;
    return new Promise(function (res) {
      var done = false, played = false;
      function finish() {
        if (done) return; done = true;
        try { v.pause(); } catch (e) { }
        show(v, false); v.removeAttribute('src'); try { v.load(); } catch (e) { }
        show(root, false); cls(root, 'fx-on', false);
        res(played);
      }
      v.onerror = function () { finish(); };
      v.onended = function () { finish(); };
      v.src = src;
      show(root, true); cls(root, 'fx-on', true); show(v, true);
      cls(v, 'is-playing', false); void v.offsetWidth; cls(v, 'is-playing', true);
      var p = v.play();
      if (p && p.catch) p.catch(function () { finish(); });
      setTimeout(function () { if (!done) finish(); }, M(Math.min(M_.videoMax, Math.max(M_.videoMin, 4200))));
      setTimeout(function () { played = true; }, 150);
    });
  }
  function characterFx(ch) {
    initDom();
    if (calm()) { killAll(); return Promise.resolve(false); }
    var root = fx.root, M_ = CFG.motion.character, name = window.I18N.charName(ch);
    show(root, true); cls(root, 'fx-on', true);
    show(fx.center, true);
    fx.center.innerHTML = '<span class="fx-glyph" style="color:' + ch.c1 + '">' + (ch.glyph || '✦') + '</span>' +
      '<b class="fx-name">' + window.XXUtil.esc(name) + '</b>' +
      '<i class="fx-tag">' + window.I18N.t('fav.step') + '</i>';
    cls(fx.center, 'is-pop', false); void fx.center.offsetWidth; cls(fx.center, 'is-pop', true);
    if (!reduce()) spawnFx(ch);
    return wait(M_.fx).then(function () {
      cls(fx.center, 'is-out', true);
      return wait(320);
    }).then(function () {
      show(fx.center, false); cls(fx.center, 'is-out', false);
      clearParts();
      show(root, false); cls(root, 'fx-on', false);
    });
  }

  /* 各角色的特效（作者之後上傳影片就輪不到這裡，但沒影片時依然有質感）*/
  function spawnFx(ch) {
    var W = innerWidth, H = innerHeight, C = ch.c1, C2 = ch.c2;
    switch (ch.fx) {
      case 'petals':
        for (var i = 0; i < 46; i++) P({ type: 'glyph', ch: pick(['❀', '✿', '❁', '❃']), x: Math.random() * W, y: -20 - Math.random() * H * .4,
          size: 12 + Math.random() * 22, color: Math.random() < .5 ? C : C2, vy: 2.1 + Math.random() * 2.4, vx: (Math.random() - .5) * 1.6,
          rot: Math.random() * 6, spin: (Math.random() - .5) * .12, max: 110, sway: 1 + Math.random() * 2 });
        break;
      case 'talisman':
        for (var r = 0; r < 3; r++) P({ type: 'ring', x: W / 2, y: H / 2, r: 30 + r * 24, grow: 3.4 + r, color: C, w: 2.4 - r * .5, max: 80, fade: true });
        var gk = ['敕', '令', '道', '法', '玄', '炁'];
        for (var k = 0; k < 14; k++) {
          var ang = k / 14 * 6.283, rad = 90 + Math.random() * 40;
          P({ type: 'glyph', ch: gk[k % gk.length], x: W / 2 + Math.cos(ang) * rad, y: H / 2 + Math.sin(ang) * rad,
            size: 16 + Math.random() * 14, color: k % 2 ? C : C2, glow: true, max: 90,
            upd: function (p) { p.a0 = (p.a0 == null ? Math.atan2(p.y - H / 2, p.x - W / 2) : p.a0 + .035); p.r0 = (p.r0 == null ? Math.hypot(p.x - W / 2, p.y - H / 2) : p.r0 + 1.1);
              p.x = W / 2 + Math.cos(p.a0) * p.r0; p.y = H / 2 + Math.sin(p.a0) * p.r0; } });
        }
        break;
      case 'sword': qiStreaks(C, 40); break;
      case 'flame':
        for (var f = 0; f < 60; f++) P({ type: 'blob', x: Math.random() * W, y: H + Math.random() * 60, r: 2 + Math.random() * 5,
          color: Math.random() < .6 ? C : C2, vy: -(2.2 + Math.random() * 3.2), vx: (Math.random() - .5) * 1.2, max: 90, shrink: .55 });
        break;
      case 'lightning':
        for (var l = 0; l < 6; l++) (function (n) { setTimeout(function () {
          P({ type: 'bolt', x: W * (0.15 + Math.random() * .7), y: H * .32, h: H * .6, seg: 7, color: n % 2 ? C : C2, w: 2.2, max: 22 }); }, n * 150); })(l);
        qiStreaks(C, 24);
        break;
      case 'sound':
        for (var s = 0; s < 7; s++) P({ type: 'ring', x: W / 2, y: H / 2, r: 10, grow: 7 + s * 1.6, color: s % 2 ? C : C2, w: 2.6 - s * .2, max: 90 - s * 4, fade: true, delay: s * 90 });
        break;
      case 'ink':
      default:
        for (var b = 0; b < 22; b++) P({ type: 'blob', x: W / 2 + (Math.random() - .5) * W * .6, y: H / 2 + (Math.random() - .5) * H * .5,
          r: 4 + Math.random() * 18, grow: .8 + Math.random() * 1.9, color: b % 3 ? 'rgba(20,28,36,.9)' : C, max: 95 });
        for (var q = 0; q < 16; q++) P({ type: 'glyph', ch: pick(['筆', '墨', '稿', '拍', '鏡']), x: Math.random() * W, y: H * (0.2 + Math.random() * .6),
          size: 14 + Math.random() * 16, color: C, max: 80, vy: -.6, vx: .8 });
    }
    if (reduce()) clearParts();
  }
  function qiStreaks(color, n) {
    var W = innerWidth, H = innerHeight;
    for (var i = 0; i < n; i++) {
      var y = Math.random() * H;
      P({ type: 'streak', x: -140 + Math.random() * W * .3, y: y, len: 60 + Math.random() * 170, thick: 1 + Math.random() * 2.4,
        color: color, vx: 16 + Math.random() * 22, vy: -1.4 - Math.random() * 1.6, max: 46 + Math.random() * 20,
        rot: -0.16 - Math.random() * 0.06 });
    }
  }
  function rippleBurstParts(color, n) {
    var W = innerWidth, H = innerHeight;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 2 + Math.random() * 5;
      P({ type: 'blob', x: W / 2, y: H / 2, r: 1.4 + Math.random() * 3.2, color: color,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, grav: .12, max: 40 + Math.random() * 30 });
    }
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ── 通用：淡出淡入 / 小漣漪回饋 ── */
  function fadeOut(el, ms) {
    return new Promise(function (res) {
      if (!el) return res();
      el.classList.add('fade-out');
      setTimeout(function () { el.classList.remove('fade-out'); res(); }, M(ms || 500));
    });
  }
  function fadeIn(el, ms) { if (el) { el.hidden = false; el.classList.remove('fade-out'); } return Promise.resolve(); }

  function rippleAt(x, y) {
    var d = document.createElement('div');
    d.className = 'tap-ripple';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 620);
  }

  function driveDirect(id) {
    if (!id) return '';
    var key = CFG.drive.apiKey;
    if (key) return 'https://www.googleapis.com/drive/v3/files/' + id + '/media?key=' + encodeURIComponent(key);
    return 'https://drive.google.com/uc?export=download&id=' + id;
  }

  window.XXTransition = {
    init: function () { initDom(); if (!calm()) ambient(); },
    stopAmbient: function () { ambientOn = false; },
    killAll: killAll,
    isCalm: function () { return calm(); },
    setVideoMap: function (m) { videoMap = m || {}; },
    getVideoMap: function () { return videoMap; },
    intro: intro,
    skipIntro: skipIntro,
    waterDrop: waterDrop,
    swordPass: swordPass,
    character: character,
    characterFx: characterFx,
    fadeOut: fadeOut, fadeIn: fadeIn,
    rippleAt: rippleAt,
    reduced: reduce
  };
}());
