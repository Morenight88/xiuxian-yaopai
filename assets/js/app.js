/* ══════════════════════════════════════════════════════════════════════
   修仙也要拍 · 主程式 (app.js)
   語言 → 建立帳號 → 最愛角色 → 主頁（主頁 / 設定 / 建議）
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = window.XX_CONFIG, API = window.XXApi, U = window.XXUtil, TR = window.XXTransition;
  var I18N = window.I18N;
  var t = function (k, p) { return I18N.t(k, p); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var M = function (ms) { return TR.reduced() ? Math.round(ms * 0.3) : ms; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var CHARS = CFG.characters;

  var S = {
    screen: '', user: null, votes: { counts: {}, total: 0 }, posts: [], page: 1, hasMore: false,
    panel: 'feed', videos: {}, composer: { media: null, kind: 'video'}, busy: false, poll: 0,
    expanded: {}, pending: {}, net: '', netPromise: null
  };

  /* ══════════ 小工具 ══════════ */
  function el(html) { var d = document.createElement('div'); d.innerHTML = String(html).trim(); return d.firstElementChild; }
  function charById(id) { for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i]; return null; }
  function isAdmin() { return !!(S.user && S.user.role === 'admin'); }
  function brandName() { return I18N.brand(); }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (res) { setTimeout(function () { res(null); }, ms); })]);
  }
  function ago(iso) {
    var d = Date.now() - new Date(iso).getTime();
    if (!(d >= 0) || d < 60000) return t('time.now');
    var m = Math.floor(d / 60000);
    if (m < 60) return t('time.min', { count: m });
    var h = Math.floor(m / 60);
    if (h < 24) return t('time.hour', { count: h });
    var dd = Math.floor(h / 24);
    if (dd < 30) return t('time.day', { count: dd });
    return t('time.date', { date: new Date(iso).toLocaleDateString(I18N.isZh() ? 'zh-TW' : 'en-US') });
  }
  var ICON = {
    heart: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 20s-7.5-4.6-9.3-9A5 5 0 0 1 12 6.6 5 5 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    heartFill: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 20s-7.5-4.6-9.3-9A5 5 0 0 1 12 6.6 5 5 0 0 1 21.3 11c-1.8 4.4-9.3 9-9.3 9z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    bubble: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 11l8-6 8 6v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9c-.6.5-.9 1.2-.9 2.1h-5.2c0-.9-.3-1.6-.9-2.1A6 6 0 0 1 12 3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M14 5h5v14h-5M10 8l-4 4 4 4M6 12h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    image: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><path d="M4 17l5-4 4 3 3-2 4 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    film: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v14M16 5v14M3.5 9.5h17M3.5 14.5h17" stroke="currentColor" stroke-width="1.4"/></svg>',
    gif: '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3.5" y="6" width="17" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 15.2a2.6 2.6 0 1 1 .2-4.4M12.5 9v5.5M16 12.6h2.4M16 9.6h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14 0 17M12 3.5c-2.5 2.6-2.5 14 0 17" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.4 11 3.5 3.5 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 14a4 4 0 0 1 0-5.7l2-2A4 4 0 0 1 17.7 12l-1 1M14 10a4 4 0 0 1 0 5.7l-2 2A4 4 0 0 1 6.3 12l1-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 12l16-7-7 16-2.4-6.6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'
  };

  /* ══════════ i18n 套用 ══════════ */
  function applyI18n() {
    document.documentElement.lang = I18N.isZh() ? 'zh-Hant' : 'en';
    document.title = brandName() + ' · ' + t('app.tagline');
    $$('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    $$('[data-i18n-placeholder]').forEach(function (n) { n.placeholder = t(n.getAttribute('data-i18n-placeholder')); });
    $$('[data-i18n-title]').forEach(function (n) { n.title = t(n.getAttribute('data-i18n-title')); });
    $$('[data-brand-name]').forEach(function (n) { n.textContent = brandName(); });
    $$('[data-brand-seal]').forEach(function (n) { n.textContent = I18N.isZh() ? '亦拍' : 'FILM'; });
    if (S.screen) { renderRail(); renderPanelHead(); }
    if (S.panel === 'settings') mountSettings();
    if (S.posts.length) renderFeed(true);
    if ($('#fav-grid').children.length) renderFav();
    updateModeBanner();
  }

  /* ══════════ 畫面切換 ══════════ */
  function showScreen(name, opts) {
    opts = opts || {};
    var cur = $('.screen.is-active'), next = $('#screen-' + name);
    if (!next) return;
    if (cur && cur !== next) {
      cur.classList.add('is-leaving');
      (function (c) { setTimeout(function () { c.hidden = true; c.classList.remove('is-leaving', 'is-active'); }, M(opts.instant ? 0 : 380)); })(cur);
    }
    next.hidden = false;
    next.classList.remove('is-active');
    void next.offsetWidth;
    next.classList.add('is-active');
    S.screen = name;
    $('#bottom-nav').hidden = name !== 'home';
    document.body.dataset.screen = name;
    window.scrollTo(0, 0);
  }

  /* ══════════ 安全氣囊：網頁沒回應 → 自動回到登入畫面 ══════════
     1) 每個可能卡住的操作都會上鬧鐘：rescueAfterMs 之後顯示救急按鈕，
        stuckAfterMs 之後自動返回登入畫面（config.site 可調／可關）。
     2) 上次載入沒完成就關掉網頁 → 這次直接進登入畫面，並暫停動畫。
     3) 任何時候按 Shift＋L 都能強制返回登入畫面。
     4) 過場動畫的覆蓋層一定會被收掉（不然整站會蒙在黑紗下像卡死）。   */
  var MARK_KEY = 'xx.boot.mark';
  var GD = { rescue: 0, auto: 0 };

  function bootMark(stage) {
    if (!CFG.site.recovery) return;
    try { sessionStorage.setItem(MARK_KEY, JSON.stringify({ at: Date.now(), stage: stage })); } catch (e) { }
  }
  function lastBootMark() {
    try { var j = JSON.parse(sessionStorage.getItem(MARK_KEY) || 'null'); return (j && j.at) ? j : null; } catch (e) { return null; }
  }
  function calmOn(showMsg) {
    CFG.motion.enabled = false;
    document.body.classList.add('xx-calm');
    try { TR.stopAmbient(); } catch (e) { }
    try { TR.killAll(); } catch (e) { }
    if (showMsg) toast(t('recovery.calm'), 'ok');
    paintRescue(false);
  }
  function paintRescue(on) {
    var r = $('#rescue');
    if (!r) return;
    if (on) {
      $('#rescue-q').textContent = t('rescue.q');
      $('#rescue-login').textContent = t('rescue.login');
      $('#rescue-calm').textContent = t('rescue.calm');
      $('#rescue-key').textContent = t('rescue.key');
      $('#rescue-calm').hidden = (CFG.motion.enabled === false);
      r.hidden = false;
    } else { r.hidden = true; }
  }
  function guard(label, autoMs, rescueOnly) {
    unguard();
    GD.rescue = setTimeout(function () { GD.rescue = 0; paintRescue(true); }, CFG.site.rescueAfterMs);
    if (CFG.site.recovery && !rescueOnly) {
      GD.auto = setTimeout(function () {
        GD.auto = 0;
        forceLoginScreen(t('recovery.auto'));
      }, autoMs || CFG.site.stuckAfterMs);
    }
  }
  /* 雲端請求本身允許 timeoutMs 秒（Apps Script 冷開機 5–8 秒很正常），
     所以登入／選角色這類操作的「卡住」門檻一定要比它長，
     否則後端只是慢，使用者會被誤踢回登入畫面（看起來就像登入沒下一步）。*/
  function authLimit() { return Math.max(CFG.site.stuckAfterMs, CFG.backend.timeoutMs + 6000); }
  function entryLimit() {
    var introMs = CFG.motion.enabled === false ? 1400 : (CFG.motion.intro.sword + CFG.motion.intro.word + CFG.motion.intro.hold);
    return Math.max(CFG.site.stuckAfterMs, CFG.site.entryTimeoutMs + introMs + 6000);
  }
  function unguard() {
    if (GD.rescue) { clearTimeout(GD.rescue); GD.rescue = 0; }
    if (GD.auto) { clearTimeout(GD.auto); GD.auto = 0; }
    paintRescue(false);
  }
  function releaseStuck() {
    unguard();
    S.busy = false;
    try { TR.skipIntro(); } catch (e) { }
    try { TR.killAll(); } catch (e) { }
    btnBusy('#reg-submit', false); btnBusy('#log-submit', false); btnBusy('#fav-next', false);
  }
  /* 回到登入畫面（保留登入紀錄，但不假裝還在處理事情）*/
  function forceLoginScreen(reason) {
    releaseStuck(); stopPoll();
    S.user = null; S.posts = []; S.expanded = {}; S.pending = {}; S.page = 1; S.hasMore = false;
    S.net = ''; S.netPromise = null; S.panel = 'feed'; S.feedFails = 0;
    bootMark('ready');
    showScreen('account', { instant: true });
    setTab('login');
    var cached = API.cachedMe();
    if (cached && cached.username) { var n = $('#log-name'); if (n) n.value = cached.username; }
    paintBackendNote();
    if (CFG.site.calmOnStuck && CFG.motion.enabled !== false) calmOn(false);
    if (reason) toast(reason, 'bad');
    setTimeout(function () { var n = $('#log-name'); if (n) { try { n.focus(); } catch (e) { } } }, 400);
  }

  /* ══════════ 開機流程 ══════════ */
  function boot() {
    TR.init();
    var q = new URLSearchParams(location.search);
    if (CFG.motion.enabled === false) document.body.classList.add('xx-calm');
    // 上次載入沒完成（當機／硬關視窗）→ 這次直接進畫面、暫停動畫
    var prev = lastBootMark();
    var rough = !!(CFG.site.recovery && prev && prev.stage !== 'ready' && (Date.now() - prev.at) < 120000);
    if (rough) { if (CFG.site.calmOnStuck) calmOn(false); }
    bootMark('boot');
    var saved = API.lang.get();
    if (q.get('lang')) { saved = q.get('lang'); API.lang.set(saved); }
    I18N.set(saved || 'zh');
    applyI18n();
    bindStatic();
    // 作者預覽／測試用：?shot=account|fav|home|settings|suggest（僅限示範模式）
    var shot = (q.get('shot') || '').toLowerCase();
    var animOnly = { intro: 1, drop: 1, sword: 1, char: 1, debug: 1, flow: 1, stuck: 1, watchdog: 1, loginflow: 1, auth: 1, fx7: 1 };
    if (shot && (API.mode() === 'local' || animOnly[shot])) { return previewShot(shot).catch(function (e) { console.warn('[xx] preview', e); }); }
    if (!saved) { showScreen('lang', { instant: true }); bootMark('ready'); if (rough) toast(t('recovery.boot'), 'bad'); return; }
    markLang(saved);
    if (rough) toast(t('recovery.boot'), 'bad');
    enterSite(!rough);
  }

  /* 預覽某個畫面（不會存进正式資料：使用一次性帳號）*/
  function previewShot(shot) {
    markLang(I18N.lang);
    if (shot === 'debug') {
      showScreen('fav'); renderFav();
      var out = ['innerW ' + innerWidth + '   clientW ' + document.documentElement.clientWidth,
        'screensW ' + $('#screens').scrollWidth + '   screenW ' + Math.round($('#screen-fav').getBoundingClientRect().width),
        'wrapW ' + Math.round($('.fav-wrap').getBoundingClientRect().width) + '   gridW ' + Math.round($('#fav-grid').getBoundingClientRect().width),
        'cols ' + getComputedStyle($('#fav-grid')).gridTemplateColumns.split(' ').length + '  dpr ' + (window.devicePixelRatio || 1)];
      var names = ['青雲子', 'CloudDisciple', '剣美', '선우', 'abc def', 'ab!', 'a', 'user_name', '小師妹2026'];
      names.forEach(function (nm) { out.push('NAME ' + nm + ' -> ' + (U.validName(nm) || 'OK')); });
      $('#fav-grid').innerHTML = '<div class="set-card" style="opacity:1;text-align:left">' +
        out.map(function (s) { return '<div style="font-size:17px;line-height:1.45;font-weight:600">' + U.esc(s) + '</div>'; }).join('') + '</div>';
      return Promise.resolve();
    }
    if (shot === 'intro') {
      showScreen('lang', { instant: true });
      return loadCharVideos(false).then(function () { return TR.intro(CHARS[1]); });
    }
    if (shot === 'drop') { showScreen('account', { instant: true }); setTab('register'); return TR.waterDrop(); }
    if (shot === 'sword') { showScreen('fav', { instant: true }); renderFav(); return TR.swordPass('#bfe3ff'); }
    if (shot === 'char') { showScreen('home', { instant: true }); return TR.character(CHARS[parseInt((new URLSearchParams(location.search)).get('c') || '0', 10)] || CHARS[0]); }
    if (shot === 'flow') {
      // 走「真實點擊流程」：語言 → 建立帳號 → 選角色（驗證不會卡住、覆蓋層會收掉）
      var log = [];
      showScreen('lang', { instant: true }); markLang('zh');
      return sleep(80)
        .then(function () { return chooseLang('zh', { clientX: 240, clientY: 240 }); })
        .then(function () {
          log.push('1 語言 → ' + S.screen + ' | busy=' + S.busy + ' | veilOn=' + $('#fx').classList.contains('fx-on') + ' | fxHidden=' + $('#fx').hidden);
          $('#reg-name').value = '測試流程'; $('#reg-pw').value = 'pw123456'; $('#reg-pw2').value = 'pw123456';
          return submitRegister({ preventDefault: function () { } });
        })
        .then(function () {
          log.push('2 建帳號 → ' + S.screen + ' | busy=' + S.busy + ' | veilOn=' + $('#fx').classList.contains('fx-on') + ' | err=' + ($('#reg-error').textContent || 'ok'));
          return pickFavorite('shi-zun');
        })
        .then(function () {
          log.push('3 選角色 → ' + S.screen + ' | user=' + (S.user && S.user.username) + ' | fav=' + (S.user && S.user.favorite));
          log.push('4 收尾 | veilOn=' + $('#fx').classList.contains('fx-on') + ' | fxHidden=' + $('#fx').hidden + ' | introHidden=' + $('#intro').hidden + ' | busy=' + S.busy);
          return sleep(1700);
        })
        .then(function () { log.push('5 動畫結束後 | veilOn=' + $('#fx').classList.contains('fx-on') + ' | fxHidden=' + $('#fx').hidden); logDump(log); });
    }
    if (shot === 'stuck') {
      // 後端完全沒回應（?backend= 指向不會應答的位址）→ 驗證會自動回到登入畫面
      var slog = [];
      showScreen('lang', { instant: true }); markLang('zh');
      return sleep(80)
        .then(function () { return chooseLang('zh', { clientX: 200, clientY: 200 }); })
        .then(function (r) {
          slog.push('chooseLang → ' + JSON.stringify(r));
          slog.push('screen=' + S.screen + ' | busy=' + S.busy + ' | veilOn=' + $('#fx').classList.contains('fx-on') + ' | fxHidden=' + $('#fx').hidden);
          slog.push('rescue=' + !$('#rescue').hidden + ' | net=' + S.net);
          return sleep(CFG.site.stuckAfterMs + 1200);
        })
        .then(function () {
          slog.push('之後: screen=' + S.screen + ' | tabLogin=' + !$('#form-login').hidden + ' | busy=' + S.busy + ' | calm=' + (CFG.motion.enabled === false));
          logDump(slog);
        });
    }
    if (shot === 'watchdog') {
      // 假設有個永遠不會完成的操作：鬧鐘應該先顯示救急按鈕，再自動回登入畫面
      var wlog = [];
      showScreen('lang', { instant: true }); markLang('zh');
      S.busy = true; guard('test');
      return sleep(CFG.site.rescueAfterMs + 500).then(function () {
        wlog.push('A 救急按鈕出現了嗎 → ' + !$('#rescue').hidden);
        return sleep(CFG.site.stuckAfterMs - CFG.site.rescueAfterMs + 700);
      }).then(function () {
        wlog.push('B 自動回登入 → screen=' + S.screen + ' | loginTab=' + !$('#form-login').hidden + ' | busy=' + S.busy + ' | rescueHidden=' + $('#rescue').hidden + ' | 動畫已暫停=' + (CFG.motion.enabled === false));
        logDump(wlog);
      });
    }
    if (shot === 'loginflow') {
      // 真實「登入」流程；加 ?slow=9000 可模擬 Apps Script 冷開機很慢（不應該被踢回登入畫面）
      var llog = [];
      showScreen('account', { instant: true }); setTab('login');
      var slow = parseInt((new URLSearchParams(location.search)).get('slow') || '0', 10);
      var realLogin = API.login;
      if (slow > 0) {
        API.login = function (n) { return new Promise(function (res) { setTimeout(function () { res({ ok: true, user: { username: n, role: 'member', favorite: 'shi-zun' }, token: 'fake' }); }, slow); }); };
        llog.push('模擬後端延遲 ' + slow + 'ms | 卡住自動回登入門檻 = ' + authLimit() + 'ms');
      }
      $('#log-name').value = '毛奈'; $('#log-pw').value = 'Rorkey@0820';
      return sleep(80)
        .then(function () { return submitLogin({ preventDefault: function () { } }); })
        .then(function () {
          llog.push('1 登入後 → screen=' + S.screen + ' | user=' + (S.user && S.user.username) + ' | busy=' + S.busy);
          return sleep(2600);
        })
        .then(function () {
          llog.push('2 過場結束 → screen=' + S.screen + ' | user=' + (S.user && S.user.username) +
            ' | 主頁已顯示=' + (!!$('#panel-feed') && !$('#panel-feed').hidden) +
            ' | 救急列已收=' + $('#rescue').hidden + ' | veilOn=' + $('#fx').classList.contains('fx-on'));
          API.login = realLogin;
          logDump(llog);
        });
    }
    if (shot === 'auth') {
      // 驗證「需要登入的動作」是否自動带上權杖（搭配會驗證權杖的模擬後端）
      var alog = [];
      API.setToken('TEST-TOKEN-123', true);
      function probe(label, p) {
        return p.then(function (r) { alog.push(label + ' → ok=' + (r && r.ok) + ' | error=' + ((r && r.error) || '-')); });
      }
      return probe('setFavorite 帶權杖  ', API.setFavorite('shi-zun'))
        .then(function () { return probe('submitSuggestion 帶權杖', API.suggest('測試建議')); })
        .then(function () { return probe('setFavorite 故意不帶  ', API.call('setFavorite', { characterId: 'shi-zun', token: '' })); })
        .then(function () { return probe('createPost 附上傳檔案', API.createPost({ text: '測試', media: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: 'x.png', kind: 'image' } })); })
        .then(function () { return probe('suggest 超過法陣長度', API.suggest(new Array(701).join('測'))); })
        .then(function () { API.setToken('TEST-TOKEN-123', true); return probe('createPost 純文字   ', API.createPost({ text: '這則只有文字，應該要成功' })); })
        .then(function () { logDump(alog); API.clearToken(); });
    }
    if (shot === 'fx7') {
      // 七種內建角色過場動畫依序跑，確認每個都能完成並把覆蓋層收干净
      showScreen('home', { instant: true });
      var flog = [], chain = Promise.resolve();
      CHARS.forEach(function (ch, i) {
        chain = chain.then(function () {
          return TR.character(ch).then(function () {
            flog.push((i + 1) + '. ' + ch.zh + '（fx=' + ch.fx + '）跑完=true' +
              ' | 覆蓋層已收=' + ($('#fx').hidden === true) + ' | veilOn=' + $('#fx').classList.contains('fx-on'));
          });
        });
      });
      return chain.then(function () { logDump(flog); });
    }
    var demoName = '試劍者', admin = CFG.admin.username;
    return API.init()
      .then(function () { return API.login(demoName, 'demo1234', true); })
      .then(function (r) { return r.ok ? r : API.register(demoName, 'demo1234', true); })
      .then(function (r) { if (r && r.ok) { S.user = r.user; rememberMe(r.user); } })
      .then(function () {
        if (shot === 'account') { showScreen('account'); setTab('register'); return; }
        if (shot === 'fav') { showScreen('fav'); return loadVotes().then(renderFav); }
        return loginAs('毛奈', 'Rorkey@0820').then(function () {
          if (shot === 'settings' || shot === 'suggest') { S.panel = shot; showScreen('home'); mountHome(); return; }
          showScreen('home'); mountHome();
        });
      })
      .then(function () { return seedDemoPosts(); })
      .then(function () { if (shot === 'fav') renderFav(); if (S.screen === 'home') mountHome(); });
  }
  /* 把流程測試結果畫在畫面上（只有 ?shot=flow / ?shot=stuck 會用到）*/
  function logDump(lines) {
    var old = $('#flowlog');
    if (old) old.remove();
    document.body.appendChild(el('<div id="flowlog" style="position:fixed;left:16px;top:16px;z-index:400;' +
      'background:rgba(6,10,16,.95);border:1px solid rgba(230,194,107,.55);border-radius:12px;padding:14px 16px;' +
      'font:600 16px/1.55 system-ui,sans-serif;color:#f6ecd0;max-width:min(92vw,820px)">' +
      lines.map(function (s) { return '<div>' + U.esc(String(s)) + '</div>'; }).join('') + '</div>'));
  }
  function loginAs(name, pw) { return API.login(name, pw, true).then(function (r) { if (r.ok) { S.user = r.user; rememberMe(r.user); } return r; }); }
  function seedDemoPosts() {
    if (!isAdmin()) return Promise.resolve();
    return API.getFeed(1, 4).then(function (r) {
      if (r && r.posts && r.posts.length) return r;
      var samples = [
        { kind: 'video', caption: '第一集預告 · 劍氣橫空（示範影片；正式上線後請從雲端影片資料夾挑選）', media: { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', name: 'demo-clip.mp4', kind: 'video' } },
        { kind: 'image', caption: '海報圖 · 仙友們都到齊了（示範圖片）', media: { url: 'https://picsum.photos/seed/xiuxian-poster/900/600', name: 'demo-poster.jpg', kind: 'image' } }
      ];
      return Promise.all(samples.map(function (s) { return API.createPost({ kind: s.kind, caption: s.caption, media: s.media }); }))
        .then(function (rs) {
          var first = rs && rs[0] && rs[0].post;
          if (!first) return rs;
          return API.login('試劍者', 'demo1234', true).then(function (l) {
            if (!l.ok) return rs;
            return API.addComment(first.id, { text: '這一集的飛劍特效太燃了！', kind: 'text' }).then(function () {
              API.login('毛奈', 'Rorkey@0820', true);
              return rs;
            });
          });
        });
    });
  }

  function markLang(lang) {
    $$('.lang-card').forEach(function (c) { c.classList.toggle('is-chosen', c.dataset.lang === lang); });
    document.body.dataset.lang = lang;
  }

  function loadCharVideos(refresh) {
    return withTimeout(API.characterVideos(refresh), refresh ? 6000 : 1500).then(function (r) {
      if (r && r.ok && r.map) { S.videos = r.map; TR.setVideoMap(S.videos); }
      return r;
    });
  }

  function enterSite(withIntro) {
    var me = API.cachedMe();
    var ch = me && me.favorite ? charById(me.favorite) : null;
    guard('entry', entryLimit());
    return loadCharVideos(false)
      .then(function () { return withIntro ? TR.intro(ch) : null; })
      .then(function () { return routeEntry(); })
      .then(function (r) { unguard(); return r; },
              function (e) { console.warn('[xx] 進站流程出錯', e); unguard(); forceLoginScreen(t('recovery.auto')); return { ok: false, error: 'CRASH' }; });
  }

  function routeEntry() {
    return withTimeout(API.whoami(), CFG.site.entryTimeoutMs).then(function (r) {
      if (!r) {   // 雲端沒回應：不要讓使用者盯著空白畫面，直接給登入畫面
        S.net = 'bad';
        showScreen('account', { instant: true });
        setTab(API.cachedMe() ? 'login' : 'register');
        var cached = API.cachedMe();
        if (cached && cached.username) { var n = $('#log-name'); if (n) n.value = cached.username; }
        paintBackendNote();
        toast(t('err.timeout'), 'bad');
        bootMark('ready');
        return { ok: false, error: 'TIMEOUT' };
      }
      if (r.ok) {
        S.user = r.user;
        showScreen('home');
        mountHome();
      } else {
        showScreen('account');
        setTab(API.cachedMe() ? 'login' : 'register');
        paintBackendNote();
      }
      bootMark('ready');
      return r;
    });
  }

  /* ══════════ 第一步驟：語言 ══════════ */
  function chooseLang(lang, ev) {
    if (S.busy) return;
    S.busy = true;
    guard('lang', entryLimit());
    try {
      if (ev) TR.rippleAt(ev.clientX, ev.clientY);
      API.lang.set(lang);
      I18N.set(lang);
      markLang(lang);
      applyI18n();
    } catch (e) { console.warn('[xx] 語言切換失敗', e); }
    var p = TR.waterDrop();
    return sleep(M(CFG.motion.waterDrop.fall + 230))
      .then(routeEntry)
      .then(function (r) { return p.then(function () { return r; }, function () { return r; }); })
      .then(function (r) { S.busy = false; unguard(); return r; },
              function (e) { console.warn('[xx] 語言流程出錯', e); forceLoginScreen(t('recovery.auto')); return { ok: false, error: 'CRASH' }; });
  }

  /* ══════════ 第二步驟：建立帳號 / 登入 ══════════ */
  function setTab(which) {
    var reg = which !== 'login';
    $('#tab-register').classList.toggle('is-active', reg);
    $('#tab-login').classList.toggle('is-active', !reg);
    $('#form-register').hidden = !reg;
    $('#form-login').hidden = reg;
    var ink = $('#tab-ink'), btn = reg ? $('#tab-register') : $('#tab-login');
    ink.style.transform = 'translateX(' + (reg ? 0 : btn.offsetLeft) + 'px)';
    ink.style.width = btn.offsetWidth + 'px';
    paintBackendNote();
  }

  function backendLabel() {
    if (!API.hasBackend()) return t('settings.backendLocal');
    if (API.originBlocked()) return t('err.fileOrigin');
    if (S.net === 'ok') return t('settings.backendCloud');
    if (S.net === 'bad') return t('err.network');
    return t('settings.backendChecking');
  }
  function netCheck(force) {
    if (!API.hasBackend()) { S.net = 'local'; return Promise.resolve('local'); }
    if (API.originBlocked()) { S.net = 'bad'; return Promise.resolve('bad'); }   // file:// 一定連不到，直接告訴使用者該怎麼開
    if (!S.netPromise || force) {
      S.netPromise = API.init().then(function (r) { S.net = (r && r.ok) ? 'ok' : 'bad'; return S.net; });
    }
    return S.netPromise;
  }
  function paintBackendNote() {
    var n = $('#account-backend');
    if (!n) return;
    var before = S.net;
    var cls = !API.hasBackend() ? 'warn' : (S.net === 'ok' ? 'ok' : (S.net === 'bad' ? 'bad' : 'warn'));
    n.innerHTML = '<span class="dot ' + cls + '"></span>' + U.esc(backendLabel());
    // 只在連線狀態「改變」時重畫一次（原本無條件重畫會變成無限迴圈把頁面當機）
    netCheck(false).then(function () {
      if (S.screen === 'account' && S.net !== before) paintBackendNote();
    });
  }

  /* 雲端類的錯誤（不是密碼錯）→ 明確告訴使用者是後端問題，並開部署說明 */
  function cloudish(r) {
    var e = r && r.error;
    return API.hasBackend() && (e === 'NETWORK' || e === 'TIMEOUT' || e === 'PERMISSION' || e === 'SERVER' || e === 'BUSY' || e === 'NO_BACKEND' || e === 'FOLDER_NOT_FOUND');
  }
  function howtoBody() {
    return el('<div class="howto"><p>assets/js/config.js → <code>backend.appsScriptUrl</code></p>' +
      '<p>1. Google Drive → Apps Script → 貼上 <code>google-apps-script/Code.gs</code></p>' +
      '<p>2. 部署 → 新增部署方式 → 網路應用程式（執行者：我自己／存取：所有人）</p>' +
      '<p>3. 複製 /exec 網址貼到 config.js，重新整理網站</p>' +
      '<p>每次改過 Code.gs 都要「管理部署 → 編輯 → 新版本」。</p><p>詳情請見 README.md（含英文說明）。</p></div>');
  }
  function showCloudHelp(r) {
    if (!API.hasBackend()) return;
    S.net = 'bad'; S.netPromise = Promise.resolve('bad');
    if (S.screen === 'account') paintBackendNote();
    if (cloudish(r)) { toast(t('err.network'), 'bad'); openModal({ title: t('mode.howto'), body: howtoBody() }); }
  }

  function formError(id, key, params) {
    var n = $(id);
    if (!key) { n.hidden = true; n.textContent = ''; return; }
    n.hidden = false;
    n.textContent = t(key, params);
  }

  function submitRegister(ev) {
    ev.preventDefault();
    if (S.busy) return;
    var name = $('#reg-name').value.trim(), pw = $('#reg-pw').value, pw2 = $('#reg-pw2').value, rem = $('#reg-remember').checked;
    var bad = U.validName(name);
    if (bad) return formError('#reg-error', bad);
    if (pw.length < 6) return formError('#reg-error', 'err.pwShort');
    if (pw !== pw2) return formError('#reg-error', 'err.pwMatch');
    formError('#reg-error', null);
    S.busy = true;
    btnBusy('#reg-submit', true);
    guard('auth', authLimit());
    return API.register(name, pw, rem).then(function (r) {
      btnBusy('#reg-submit', false);
      S.busy = false;
      unguard();
      if (!r.ok) { showCloudHelp(r); return formError('#reg-error', (r.message && r.message.indexOf('.') > 0) ? r.message : API.errKey(r)); }
      if (!r.user) { showCloudHelp(r); return formError('#reg-error', 'err.network'); }
      S.user = r.user;
      rememberMe(r.user);
      $('#form-register').reset();
      // 建立完成 → 飛劍掠過 → 第三步驟
      var p = TR.swordPass('#bfe3ff');
      if (S.user.favorite) { showScreen('home'); mountHome(); return p; }
      showScreen('fav');
      renderFav();
      bootMark('ready');
      return p;
    }, function (e) {
      console.warn('[xx] 建立帳號出錯', e);
      forceLoginScreen(t('recovery.auto'));
      return { ok: false, error: 'CRASH' };
    });
  }

  function submitLogin(ev) {
    ev.preventDefault();
    if (S.busy) return;
    var name = $('#log-name').value.trim(), pw = $('#log-pw').value, rem = $('#log-remember').checked;
    if (!name) return formError('#log-error', 'err.nameRequired');
    formError('#log-error', null);
    S.busy = true; btnBusy('#log-submit', true);
    guard('auth', authLimit());
    return API.login(name, pw, rem).then(function (r) {
      btnBusy('#log-submit', false); S.busy = false; unguard();
      if (!r.ok) { showCloudHelp(r); return formError('#log-error', API.errKey(r)); }
      if (!r.user) { showCloudHelp(r); return formError('#log-error', 'err.network'); }
      S.user = r.user;
      rememberMe(r.user);
      $('#form-login').reset();
      var ch = S.user.favorite ? charById(S.user.favorite) : null;
      var p = ch ? TR.character(ch) : TR.swordPass('#8fd7ff');
      showScreen('home');
      mountHome();
      bootMark('ready');
      return p;
    }, function (e) {
      console.warn('[xx] 登入出錯', e);
      forceLoginScreen(t('recovery.auto'));
      return { ok: false, error: 'CRASH' };
    });
  }

  function rememberMe(user) { try { localStorage.setItem('xx.me', JSON.stringify(user)); } catch (e) { } }
  function btnBusy(sel, on) {
    var b = $(sel);
    if (!b) return;
    b.classList.toggle('is-busy', on);
    b.disabled = !!on;
  }

  /* ══════════ 第三步驟：最愛角色 ══════════ */
  function renderFav() {
    var grid = $('#fav-grid');
    grid.innerHTML = '';
    CHARS.forEach(function (c, i) {
      var n = S.votes.counts[c.id] || 0;
      var mine = S.user && S.user.favorite === c.id;
      var card = el('<button type="button" class="fav-card' + (mine ? ' is-mine' : '') + '" data-id="' + c.id + '" style="--c1:' + c.c1 + ';--c2:' + c.c2 + '">' +
        '<span class="fav-idx">' + (i + 1) + '</span>' +
        '<span class="fav-glyph">' + (c.glyph || '✦') + '</span>' +
        '<b class="fav-name">' + U.esc(I18N.charName(c)) + '</b>' +
        '<span class="fav-en">' + U.esc(c.en !== I18N.charName(c) ? c.en : '') + '</span>' +
        '<span class="fav-count">' + t('fav.count', { count: n }) + '</span>' +
        '<span class="fav-bar"><i style="width:' + pct(n, S.votes.total) + '%"></i></span>' +
        (S.videos[c.id] ? '<span class="fav-video">' + t('post.video') + '</span>' : '') +
        '</button>');
      grid.appendChild(card);
    });
    $('#fav-total').textContent = t('fav.total', { count: S.votes.total || 0 });
  }
  function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }

  function pickFavorite(id, ev) {
    if (S.busy) return;
    var c = charById(id);
    if (!c) return;
    if (ev) TR.rippleAt(ev.clientX, ev.clientY);
    if (!S.user) {   // 尚未登入（跳過登入直接看角色）→ 先導向帳號畫面
      showScreen('account'); setTab('register'); return;
    }
    S.busy = true;
    guard('fav', authLimit());
    return API.setFavorite(id).then(function (r) {
      S.busy = false;
      unguard();
      if (!r.ok) return toast(API.errText(r, t), 'bad');
      S.user.favorite = r.favorite || id;
      if (r.votes) S.votes = r.votes;
      rememberMe(S.user);
      var p = TR.character(c);           // 角色專屬過場（雲端影片或內建特效）
      showScreen('home');
      mountHome();
      renderFav();
      bootMark('ready');
      return p;
    }, function (e) {
      console.warn('[xx] 選擇角色出錯', e);
      forceLoginScreen(t('recovery.auto'));
      return { ok: false, error: 'CRASH' };
    });
  }

  /* ══════════ 主頁骨架 ══════════ */
  function mountHome() {
    renderRail();
    renderPanelHead();
    showPanel(S.panel || 'feed', true);
    updateModeBanner();
    renderTopMe();
    loadVotes();
    loadFeed(true);
    startPoll();
    netCheck(false).then(function () { updateModeBanner(); renderTopMe(); });
  }
  function renderTopMe() {
    var me = $('#topbar-me');
    me.innerHTML = S.user
      ? '<span class="ava sm">' + U.esc(S.user.username.slice(0, 1)) + '</span><span class="me-name">' + U.esc(S.user.username) +
        (isAdmin() ? '<i class="badge">' + t('settings.roleAdmin') + '</i>' : '') + '</span>'
      : '';
  }
  function renderRail() {
    var items = [
      { k: 'feed', ic: ICON.home, label: t('nav.feed') },
      { k: 'settings', ic: ICON.gear, label: t('nav.settings') },
      { k: 'suggest', ic: ICON.bulb, label: t('nav.suggest') }
    ];
    var list = $('#rail-list'), bn = $('#bottom-nav');
    list.innerHTML = ''; bn.innerHTML = '';
    items.forEach(function (it) {
      var b = el('<button type="button" class="rail-item' + (S.panel === it.k ? ' is-on' : '') + '" data-panel="' + it.k + '">' +
        it.ic + '<span>' + it.label + '</span></button>');
      list.appendChild(b);
      bn.appendChild(el('<button type="button" class="bn-item' + (S.panel === it.k ? ' is-on' : '') + '" data-panel="' + it.k + '">' + it.ic + '<span>' + it.label + '</span></button>'));
    });
    $('#rail-foot').innerHTML =
      '<div class="rail-me"><span class="ava">' + U.esc((S.user && S.user.username.slice(0, 1)) || '?') + '</span>' +
      '<div><b>' + U.esc(S.user && S.user.username || '') + '</b><i>' + t(isAdmin() ? 'settings.roleAdmin' : 'settings.roleMember') + '</i></div></div>' +
      '<button type="button" class="rail-item danger" id="btn-logout">' + ICON.out + '<span>' + t('nav.logout') + '</span></button>';
    $('#btn-logout').onclick = doLogout;
    $$('[data-panel]').forEach(function (b) { b.onclick = function (e) { TR.rippleAt(e.clientX, e.clientY); showPanel(b.dataset.panel); }; });
  }
  function renderPanelHead() {
    var map = { feed: ['panel.feed.title', 'panel.feed.sub'], settings: ['panel.settings.title', 'panel.settings.sub'], suggest: ['panel.suggest.title', 'panel.suggest.sub'] };
    var m = map[S.panel] || map.feed;
    $('#panel-title').textContent = t(m[0]);
    $('#panel-sub').textContent = t(m[1]);
  }
  function showPanel(which, instant) {
    if (S.panel !== which && !instant) {
      var cur = $('.panel:not([hidden])');
      if (cur) { cur.classList.add('is-leaving'); setTimeout(function () { cur.hidden = true; cur.classList.remove('is-leaving'); }, M(240)); }
    } else {
      $$('.panel').forEach(function (p) { p.hidden = true; });
    }
    S.panel = which;
    var p = $('#panel-' + which);
    setTimeout(function () {
      p.hidden = false;
      p.classList.remove('is-active'); void p.offsetWidth; p.classList.add('is-active');
      renderPanelHead();
      renderRail();
      if (which === 'settings') mountSettings();
      if (which === 'suggest') mountSuggest();
      if (which === 'feed') { renderComposer(); }
      revealObserve();
    }, instant ? 0 : M(200));
    if (which === 'feed') window.scrollTo({ top: 0, behavior: TR.reduced() ? 'auto' : 'smooth' });
  }

  /* ══════════ 雲端狀態 ══════════ */
  function updateModeBanner() {
    var b = $('#mode-banner');
    b.hidden = API.hasBackend() && S.net !== 'bad';
    $('#mode-banner-text').textContent = t('mode.demoBanner');
    if (!API.hasBackend() && S.user && isAdmin()) {
      $('#mode-banner-text').textContent = t('mode.demoBanner') + '　' + t('mode.demoUser');
    }
    if (S.net === 'bad') $('#mode-banner-text').textContent = t('err.network');
    if (API.hasBackend() && API.originBlocked()) {
      b.hidden = false;
      $('#mode-banner-text').textContent = t('err.fileOrigin');
    }
  }

  /* ══════════ 貼文 ══════════ */
  function loadVotes() {
    return API.getVotes().then(function (r) { if (r.ok) { S.votes = r.votes; if ($('#fav-grid').children.length) renderFav(); } });
  }

  function loadFeed(reset, page) {
    var feed = $('#feed');
    if (reset) { feed.innerHTML = skeleton(2); S.page = 1; S.posts = []; }
    guard('feed', 0, true);                       // 只顯示救急按鈕，不自動趕人回登入
    return withTimeout(API.getFeed(page || S.page, 12), CFG.site.feedTimeoutMs).then(function (r) {
      unguard();
      if (!r) { feed.innerHTML = ''; feed.appendChild(feedError(t('err.timeout'))); bumpFeedFail(); return { ok: false, error: 'TIMEOUT' }; }
      if (!r.ok) { feed.innerHTML = ''; feed.appendChild(feedError(API.errText(r, t))); bumpFeedFail(); return r; }
      S.feedFails = 0;
      if (reset) feed.innerHTML = '';
      S.posts = S.posts.concat(r.posts || []);
      S.page = r.page; S.hasMore = r.hasMore;
      (r.posts || []).forEach(function (p) { feed.appendChild(postNode(p)); });
      $('#feed-foot').innerHTML = '';
      if (!S.posts.length) feed.appendChild(emptyState(t('feed.empty'), t('feed.emptySub')));
      else if (S.hasMore) {
        var more = el('<button type="button" class="btn btn-ghost wide" id="btn-more">' + t('feed.loadMore') + '</button>');
        $('#feed-foot').appendChild(more);
        more.onclick = function () { S.page++; loadFeed(false, S.page); };
      }
      revealObserve();
      return r;
    }, function (e) {
      console.warn('[xx] 貼文載入出錯', e);
      unguard();
      feed.innerHTML = '';
      feed.appendChild(feedError(t('post.loadFailed')));
      bumpFeedFail();
      return { ok: false, error: 'CRASH' };
    });
  }
  /* 連續好幾次都抓不到貼文 → 依需求自動回到登入畫面（不會一直卡在載入中）*/
  function bumpFeedFail() {
    S.feedFails = (S.feedFails || 0) + 1;
    if (CFG.site.recovery && S.feedFails >= 3) forceLoginScreen(t('recovery.auto'));
  }
  function feedError(msg) {
    var node = el('<div class="empty is-error"><span class="empty-glyph">⚠</span><b>' + U.esc(t('post.loadFailed')) + '</b>' +
      '<i>' + U.esc(msg || t('err.timeout')) + '</i>' +
      '<span class="empty-acts"><button type="button" class="btn btn-ghost" id="fe-retry">' + t('post.retry') + '</button>' +
      '<button type="button" class="btn btn-ghost" id="fe-login">' + t('post.backLogin') + '</button></span></div>');
    node.querySelector('#fe-retry').onclick = function () { loadFeed(true); };
    node.querySelector('#fe-login').onclick = function () { forceLoginScreen(t('recovery.manual')); };
    return node;
  }

  function skeleton(n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="post is-skeleton"><div class="sk sk-line"></div><div class="sk sk-media"></div><div class="sk sk-line short"></div></div>';
    return out;
  }
  function emptyState(title, sub) {
    return el('<div class="empty"><span class="empty-glyph">☁</span><b>' + U.esc(title) + '</b><i>' + U.esc(sub || '') + '</i></div>');
  }

  function postNode(p) {
    var liked = S.user && p.likes && p.likes.indexOf(S.user.username) >= 0;
    var adminPost = p.authorRole === 'admin' || p.author === CFG.admin.username;
    var node = el('<article class="post" data-id="' + p.id + '">' +
      '<header class="post-head">' +
      '<span class="ava' + (adminPost ? ' admin' : '') + '">' + U.esc(p.author.slice(0, 1)) + '</span>' +
      '<div class="who"><b>' + U.esc(p.author) + (adminPost ? '<i class="badge">' + t('settings.roleAdmin') + '</i>' : '') + '</b>' +
      '<i>' + U.esc(ago(p.createdAt)) + ' · ' + t('post.' + (p.kind || 'image')) + '</i></div>' +
      (isAdmin() ? '<button type="button" class="icon-btn del" data-act="del" title="' + t('post.delete') + '">' + ICON.trash + '</button>' : '') +
      '</header>' +
      '<div class="post-media"></div>' +
      '<div class="post-actions">' +
      '<button type="button" class="act like' + (liked ? ' is-on' : '') + '" data-act="like">' + (liked ? ICON.heartFill : ICON.heart) +
      '<span>' + t(liked ? 'post.unlike' : 'post.like') + '</span></button>' +
      '<button type="button" class="act" data-act="focus-comment">' + ICON.bubble + '<span>' + t('post.comment') + '</span></button>' +
      '<span class="hint-double">' + t('post.doubleTap') + '</span>' +
      '</div>' +
      '<div class="post-likes">' + likeText(p) + '</div>' +
      '<div class="post-comments"></div>' +
      '<form class="comment-form">' +
      '<span class="ava sm">' + U.esc((S.user && S.user.username.slice(0, 1)) || '?') + '</span>' +
      '<div class="cf-body">' +
      '<textarea rows="1" maxlength="' + CFG.site.commentMax + '" data-i18n-ph placeholder="' + U.esc(t('post.commentPh')) + '"></textarea>' +
      '<div class="cf-tools">' +
      '<button type="button" class="icon-btn" data-act="attach" title="' + t('post.attach') + '">' + ICON.image + '</button>' +
      '<input type="file" accept="image/*,video/*" hidden data-act="file">' +
      '<span class="chip" data-act="chip" hidden></span>' +
      '<button type="submit" class="btn btn-mini">' + ICON.send + '<span>' + t('post.addComment') + '</span></button>' +
      '</div></div></form></article>');

    mountMedia($('.post-media', node), p.media, p.kind);
    renderComments(node, p);

    node.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var a = btn.dataset.act;
      if (a === 'like') return toggleLike(p, node);
      if (a === 'del') return deletePost(p, node);
      if (a === 'focus-comment') { var ta = $('textarea', node); ta.focus(); autoGrow(ta); return; }
      if (a === 'attach') return $('input[type=file]', node).click();
      if (a === 'expand-comments') { S.expanded[p.id] = true; renderComments(node, p); return; }
      if (a === 'del-comment') return deleteComment(p, btn.dataset.cid, node);
    });
    $('input[type=file]', node).addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) stageCommentMedia(node, p, f);
      ev.target.value = '';
    });
    var ta = $('.comment-form textarea', node);
    ta.addEventListener('input', function () { autoGrow(ta); });
    node.querySelector('.comment-form').addEventListener('submit', function (ev) { ev.preventDefault(); sendComment(p, node, ta); });

    // 點兩下媒體 = 按讚（Instagram 式）
    var media = $('.post-media', node);
    media.addEventListener('dblclick', function (ev) {
      if (!S.user) return;
      heartBurst(media);
      if (!(S.user && p.likes.indexOf(S.user.username) >= 0)) toggleLike(p, node);
    });
    return node;
  }
  function likeText(p) {
    var n = (p.likes || []).length;
    if (!n) return '<i class="muted">' + t('post.likes', { count: 0 }) + '</i>';
    var who = p.likes.slice(0, 3).map(function (u) { return U.esc(u === (S.user && S.user.username) ? t('post.you') : u); });
    return '<b>' + who.join('、') + (p.likes.length > 3 ? '…' : '') + '</b> · ' + t(n === 1 ? 'post.likesOne' : 'post.likes', { count: n });
  }
  function autoGrow(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; }

  function renderComments(node, p) {
    var host = $('.post-comments', node);
    host.innerHTML = '';
    var all = p.comments || [];
    var open = S.expanded[p.id];
    var shown = open ? all : all.slice(-CFG.site.commentsPreview);
    if (!open && all.length > CFG.site.commentsPreview) {
      host.appendChild(el('<button type="button" class="see-more" data-act="expand-comments">' +
        t(all.length === 1 ? 'post.commentsOne' : 'post.comments', { count: all.length }) + '</button>'));
    }
    shown.forEach(function (c) {
      var mine = S.user && (c.user === S.user.username);
      var row = el('<div class="cmt" data-cid="' + c.id + '">' +
        '<span class="ava sm">' + U.esc(c.user.slice(0, 1)) + '</span>' +
        '<div class="cmt-body"><b>' + U.esc(c.user) + (mine ? ' (' + t('post.you') + ')' : '') + '</b>' +
        (c.text ? '<p>' + U.esc(c.text) + '</p>' : '') +
        (c.media ? '<div class="cmt-media"></div>' : '') +
        '<i>' + U.esc(ago(c.createdAt)) + '</i></div>' +
        ((isAdmin() || mine) ? '<button type="button" class="icon-btn xs" data-act="del-comment" data-cid="' + c.id + '">' + ICON.trash + '</button>' : '') +
        '</div>');
      if (c.media) mountMedia($('.cmt-media', row), c.media, c.kind);
      host.appendChild(row);
    });
    if (open && all.length > CFG.site.commentsPreview) {
      host.appendChild(el('<button type="button" class="see-more" data-act="collapse-comments" onclick="">' + t('post.hideComments') + '</button>'));
      host.lastChild.addEventListener('click', function () { S.expanded[p.id] = false; renderComments(node, p); });
    }
  }

  function stageCommentMedia(node, p, file) {
    // 雲端模式：留言附檔也是瀏覽器直接上傳 → 內文一樣會在轉址時遺失，先講清楚而不是報「連不上」
    if (API.mode() === 'cloud') return toast(t('err.cloudUpload'), 'bad');
    var lim = CFG.site.maxUploadBytes;
    if (file.size > lim) return toast(t('err.tooBig', { size: Math.round(lim / 1048576) }), 'bad');
    U.readFileAsDataUrl(file).then(function (du) {
      var kind = U.kindOf(file.name, file.type, 'auto');
      if (kind === 'video') return toast(t('post.noVideoComment'), 'bad');
      kind = kind || 'image';
      S.pending[node.dataset.id] = { dataUrl: du, name: file.name, mime: file.type, kind: kind };
      var chip = $('[data-act=chip]', node);
      chip.hidden = false;
      chip.innerHTML = (kind === 'gif' ? ICON.gif : ICON.image) + '<span>' + U.esc(file.name) + '</span><button type="button" data-act="drop">×</button>';
      chip.querySelector('button').onclick = function () {
        delete S.pending[node.dataset.id]; chip.hidden = true; chip.innerHTML = '';
      };
    }).catch(function () { toast(t('err.generic', { message: 'READ' }), 'bad'); });
  }

  function sendComment(p, node, ta) {
    if (!S.user) { showScreen('account'); setTab('login'); return; }
    var text = ta.value.trim(), media = S.pending[p.id];
    if (!text && !media) return toast(t('post.commentNeed'), 'bad');
    btnBusy($('.comment-form .btn-mini', node), true);
    return API.addComment(p.id, { text: text, kind: media ? media.kind : 'text', media: media }).then(function (r) {
      btnBusy($('.comment-form .btn-mini', node), false);
      if (!r.ok) return toast(API.errText(r, t), 'bad');
      var fresh = r.post || p;
      S.expanded[fresh.id] = true;
      replacePost(p, fresh, node);
      ta.value = ''; autoGrow(ta);
      delete S.pending[p.id];
    });
  }

  function replacePost(oldP, fresh, node) {
    var i = S.posts.indexOf(oldP);
    if (i >= 0) S.posts[i] = fresh;
    var fresh2 = postNode(fresh);
    node.replaceWith(fresh2);
    S.expanded[fresh.id] = S.expanded[fresh.id];
    revealOne(fresh2);
  }

  function toggleLike(p, node) {
    if (!S.user) { showScreen('account'); setTab('login'); return; }
    var btn = $('[data-act=like]', node);
    var likedNow = !btn.classList.contains('is-on');
    btn.classList.toggle('is-on', likedNow);
    btn.innerHTML = (likedNow ? ICON.heartFill : ICON.heart) + '<span>' + t(likedNow ? 'post.unlike' : 'post.like') + '</span>';
    if (likedNow) heartBurst($('.post-media', node));
    return API.toggleLike(p.id).then(function (r) {
      if (!r.ok) { btn.classList.toggle('is-on', !likedNow); return toast(API.errText(r, t), 'bad'); }
      p.likes = (r.post && r.post.likes) || p.likes;
      if (r.post) p.comments = r.post.comments || p.comments;
      $('.post-likes', node).innerHTML = likeText(p);
    });
  }
  function heartBurst(box) {
    if (!box) return;
    var h = el('<span class="burst">' + ICON.heartFill + '</span>');
    box.appendChild(h);
    setTimeout(function () { h.remove(); }, 900);
  }
  function deletePost(p, node) {
    confirmBox(t('post.deleteConfirm')).then(function (yes) {
      if (!yes) return;
      return API.deletePost(p.id).then(function (r) {
        if (!r.ok) return toast(API.errText(r, t), 'bad');
        node.classList.add('is-gone');
        setTimeout(function () { node.remove(); }, M(420));
        S.posts = S.posts.filter(function (x) { return x.id !== p.id; });
        toast(t('post.deleted'), 'ok');
      });
    });
  }
  function deleteComment(p, cid, node) {
    return API.deleteComment(p.id, cid).then(function (r) {
      if (!r.ok) return toast(API.errText(r, t), 'bad');
      if (r.post) replacePost(p, r.post, node);
    });
  }

  /* ══════════ 媒體播放 ══════════ */
  function thumbUrl(id, w) { return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 900); }
  function mountMedia(box, media, kind) {
    box.innerHTML = '';
    box.dataset.kind = kind || (media && media.kind) || '';
    if (!media) { box.appendChild(emptyState(t('err.notFound'), '')); return; }
    var pb = API.playback(media);
    if (pb.localId || pb.dataUrl) {
      var pr = pb.localId ? API.blobs.url(pb.localId) : Promise.resolve(pb.dataUrl);
      pr.then(function (src) { src ? attachMedia(box, pb, [src], null) : box.appendChild(unavailable(media)); });
      return;
    }
    if (!pb.candidates.length) {
      if (pb.iframe) attachMedia(box, pb, [], pb.iframe); else box.appendChild(unavailable(media));
      return;
    }
    attachMedia(box, pb, pb.candidates, pb.iframe);
  }
  function attachMedia(box, pb, candidates, iframe) {
    if (pb.kind === 'video') {
      var v = document.createElement('video');
      v.controls = true; v.preload = 'metadata'; v.playsInline = true;
      v.setAttribute('playsinline', ''); v.setAttribute('controlslist', 'nodownload');
      if (pb.fileId) v.poster = thumbUrl(pb.fileId, 900);
      var i = -1;
      function next() {
        i++;
        if (i < candidates.length) { v.src = candidates[i]; v.load(); }
        else if (iframe) swapIframe(box, iframe);
        else { box.innerHTML = ''; box.appendChild(unavailable(pb)); }
      }
      v.onerror = next;
      box.appendChild(v);
      next();
    } else {
      var img = document.createElement('img');
      img.loading = 'lazy'; img.alt = ''; img.decoding = 'async';
      var j = -1;
      img.onerror = function () {
        j++;
        if (j < candidates.length) img.src = candidates[j];
        else if (pb.fileId) { img.onerror = null; img.src = thumbUrl(pb.fileId, 900); }
        else { box.innerHTML = ''; box.appendChild(unavailable(pb)); }
      };
      box.appendChild(img);
      if (candidates.length) img.src = candidates[0];
      else if (pb.fileId) img.src = thumbUrl(pb.fileId, 900);
      else img.onerror();
      img.addEventListener('click', function () { if (pb.kind !== 'gif') openLightbox(pb); });
    }
  }
  function swapIframe(box, src) {
    box.innerHTML = '';
    var f = document.createElement('iframe');
    f.src = src; f.allow = 'autoplay; fullscreen; picture-in-picture'; f.allowFullscreen = true; f.title = 'Drive player';
    box.appendChild(f);
    box.classList.add('has-iframe');
  }
  function unavailable(media) {
    var id = media && (media.fileId || (media.url && U.driveId(media.url)));
    var href = id ? 'https://drive.google.com/file/d/' + id + '/view' : (media && media.url) || '#';
    return el('<div class="media-off"><span>⚠</span><b>' + U.esc(t('err.playback')) + '</b>' +
      '<a href="' + U.esc(href) + '" target="_blank" rel="noopener">' + U.esc(t('common.open')) + '</a></div>');
  }
  function openLightbox(pb) {
    var box = el('<div class="lb-media"></div>');
    var m = openModal({ title: t('post.' + pb.kind), body: box, wide: true });
    attachMedia(box, pb, pb.candidates, pb.iframe);
    m.el.classList.add('is-lightbox');
  }

  /* ══════════ 發文（管理員）══════════ */
  function renderComposer() {
    var host = $('#composer-root');
    host.innerHTML = '';
    if (!isAdmin()) {
      host.appendChild(el('<div class="composer note">' + ICON.plus + '<span>' + t('composer.onlyAdmin') + '</span></div>'));
      return;
    }
    var c = S.composer;
    var node = el('<div class="composer">' +
      '<div class="cmp-head"><b>' + t('composer.title') + '</b>' +
      '<div class="kind-tabs">' +
      ['video', 'image', 'gif'].map(function (k) {
        return '<button type="button" class="kt' + (c.kind === k ? ' is-on' : '') + '" data-kind="' + k + '">' +
          (k === 'video' ? ICON.film : k === 'image' ? ICON.image : ICON.gif) + '<span>' + t('composer.' + k) + '</span></button>';
      }).join('') + '</div></div>' +
      '<div class="cmp-media">' + (c.media
        ? '<div class="picked"><span class="pk"></span><b>' + U.esc(c.media.name || '') + '</b><button type="button" class="icon-btn" data-act="clear">' + ICON.close + '</button></div>'
        : '<button type="button" class="btn btn-ghost" data-act="pick">' + ICON.cloud + '<span>' + t('composer.pick') + '</span></button>') + '</div>' +
      '<textarea class="cmp-cap" maxlength="' + CFG.site.postCaptionMax + '" placeholder="' + U.esc(t('composer.captionPh')) + '"></textarea>' +
      '<div class="cmp-foot"><span class="note-sm">' + U.esc(backendLabel()) + '</span>' +
      '<button type="button" class="btn btn-primary" data-act="post">' + t('composer.post') + '</button></div></div>');

    if (c.media) mountMedia($('.picked .pk', node), c.media, c.media.kind);

    node.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (b && b.dataset.act === 'pick') return openPicker();
      if (b && b.dataset.act === 'clear') { S.composer.media = null; return renderComposer(); }
      if (b && b.dataset.act === 'post') return publish(node);
      var kt = ev.target.closest('[data-kind]');
      if (kt) { S.composer.kind = kt.dataset.kind; renderComposer(); }
    });
    host.appendChild(node);
    autoGrow($('.cmp-cap', node));
  }

  function publish(node) {
    var c = S.composer;
    if (!c.media) return toast(t('composer.needMedia'), 'bad');
    var cap = $('.cmp-cap', node).value.trim();
    btnBusy('[data-act=post]', true);
    var payload = {
      kind: c.media.kind || c.kind, caption: cap,
      media: { fileId: c.media.fileId, url: c.media.url, dataUrl: c.media.dataUrl, name: c.media.name, mime: c.media.mime, kind: c.media.kind }
    };
    return API.createPost(payload).then(function (r) {
      btnBusy('[data-act=post]', false);
      if (!r.ok) return toast(API.errText(r, t), 'bad');
      S.composer = { media: null, kind: c.kind };
      toast(t('settings.saved'), 'ok');
      S.posts.unshift(r.post);
      var feed = $('#feed');
      feed.innerHTML = '';
      S.posts.forEach(function (p) { feed.appendChild(postNode(p)); });
      revealObserve();
      renderComposer();
    });
  }

  /* ══════════ 媒體選擇器 ══════════ */
  function openPicker() {
    var state = { tab: 'videos', items: [], loading: true };
    var box = el('<div class="picker">' +
      '<div class="pk-tabs">' +
      '<button class="pt is-on" data-tab="videos">' + ICON.film + '<span>' + t('picker.videos') + '</span></button>' +
      '<button class="pt" data-tab="images">' + ICON.image + '<span>' + t('picker.images') + '</span></button>' +
      '<button class="pt" data-tab="upload">' + ICON.plus + '<span>' + t('picker.upload') + '</span></button>' +
      '<button class="pt" data-tab="link">' + ICON.link + '<span>' + t('picker.link') + '</span></button>' +
      '</div>' +
      '<div class="pk-body"></div></div>');
    var m = openModal({ title: t('picker.title'), body: box, wide: true });

    function paint() {
      var b = $('.pk-body', box);
      b.innerHTML = '';
      if (state.tab === 'upload') return uploadTab(b);
      if (state.tab === 'link') return linkTab(b);
      if (state.loading) { b.innerHTML = '<div class="pk-list">' + skeleton(3) + '</div>'; }
      var list = el('<div class="pk-list"></div>');
      if (!state.items.length && !state.loading) list.appendChild(emptyState(t('picker.empty'), API.hasBackend() ? '' : t('picker.noBackend')));
      state.items.forEach(function (it) {
        var row = el('<button type="button" class="pk-item"><span class="pk-thumb"></span><span class="pk-meta"><b>' + U.esc(it.name) + '</b>' +
          '<i>' + (it.kind || '?') + ' · ' + ago(it.createdAt || new Date().toISOString()) + (it.size ? ' · ' + Math.round(it.size / 1024) + 'KB' : '') + '</i></span>' +
          '<span class="pk-go">' + t('picker.pick') + '</span></button>');
        if (it.kind !== 'video' || it.fileId) mountMedia($('.pk-thumb', row), it, it.kind);
        row.onclick = function () {
          S.composer.media = { fileId: it.fileId, url: it.url, name: it.name, mime: it.mime, kind: it.kind === 'other' ? 'video' : it.kind, size: it.size };
          m.close(); renderComposer();
        };
        list.appendChild(row);
      });
      b.appendChild(list);
      b.appendChild(el('<p class="pk-note">' + U.esc(state.tab === 'videos' ? t('picker.uploadNote', { size: Math.round(CFG.site.maxUploadBytes / 1048576) }) : t('picker.linkNote')) + '</p>'));
    }
    function uploadTab(b) {
      // 雲端模式：瀏覽器直接上傳的內文會在 Apps Script 轉址時遺失（實測任何大小都送不到），
      // 所以這條改成「把檔案放進 Drive 影像庫 → 回來選用」的步驟，不要再讓它假裝能上傳。
      if (API.mode() === 'cloud') {
        var scope = state.scope || 'videos';
        var fid = scope === 'comments' ? CFG.drive.commentsFolderId : CFG.drive.videosFolderId;
        var w = el('<div class="pk-form"><p class="pk-note">' + U.esc(t('picker.cloudNote')) + '</p>' +
          '<button type="button" class="btn btn-primary" data-act="open-drive">' + U.esc(t('picker.openDrive')) + '</button>' +
          '<button type="button" class="btn btn-mini" data-act="rescan">' + U.esc(t('picker.recheck')) + '</button>' +
          '<p class="pk-note">' + U.esc(t(scope === 'comments' ? 'picker.images' : 'picker.videos')) + ' · ' + U.esc(String(fid || '')) + '</p>' +
          '<p class="pk-note">' + U.esc(t('picker.linkNote')) + '</p></div>');
        b.appendChild(w);
        $('[data-act=open-drive]', w).onclick = function () {
          if (!fid) return toast(t('err.generic', { message: 'folder id missing' }), 'bad');
          window.open('https://drive.google.com/drive/folders/' + fid, '_blank', 'noopener');
        };
        $('[data-act=rescan]', w).onclick = function () {
          state.tab = scope === 'comments' ? 'images' : 'videos';
          $$('.pt', box).forEach(function (x) { x.classList.toggle('is-on', x.dataset.tab === state.tab); });
          paint(); fetchTab();
        };
        return;
      }
      var wrap = el('<div class="pk-form"><input type="file" accept="image/*,video/*" class="pk-file"><p class="pk-note">' +
        U.esc(t('picker.uploadNote', { size: Math.round(CFG.site.maxUploadBytes / 1048576) })) + '</p><div class="pk-preview"></div></div>');
      b.appendChild(wrap);
      $('input[type=file]', wrap).addEventListener('change', function (ev) {
        var f = ev.target.files && ev.target.files[0];
        if (!f) return;
        if (f.size > CFG.site.maxUploadBytes) return toast(t('err.tooBig', { size: Math.round(CFG.site.maxUploadBytes / 1048576) }), 'bad');
        U.readFileAsDataUrl(f).then(function (du) {
          var kind = U.kindOf(f.name, f.type, 'auto') || 'image';
          S.composer.media = { dataUrl: du, name: f.name, mime: f.type, kind: kind, size: f.size };
          mountMedia($('.pk-preview', wrap), S.composer.media, kind);
          setTimeout(function () { m.close(); renderComposer(); }, 550);
        });
      });
    }
    function linkTab(b) {
      var wrap = el('<div class="pk-form"><input type="text" class="pk-link" placeholder="' + U.esc(t('picker.linkPh')) + '">' +
        '<p class="pk-note">' + U.esc(t('picker.linkNote')) + '</p>' +
        '<button type="button" class="btn btn-primary">' + t('picker.pick') + '</button></div>');
      b.appendChild(wrap);
      $('button', wrap).onclick = function () {
        var v = $('.pk-link', wrap).value.trim();
        if (!v) return;
        var id = U.driveId(v);
        if (id && /drive\.google|docs\.google/.test(v)) S.composer.media = { fileId: id, name: id, kind: 'video' };
        else if (/^https?:/.test(v)) S.composer.media = { url: v, name: v.split('/').pop(), kind: U.kindOf(v, '', 'auto') || 'image' };
        else return toast(t('err.notFound'), 'bad');
        m.close(); renderComposer();
      };
    }
    function fetchTab() {
      state.scope = state.tab === 'videos' ? 'videos' : 'comments';
      state.loading = true; paint();
      API.listMedia(state.scope).then(function (r) {
        state.loading = false;
        state.items = (r && r.media) ? r.media.filter(function (x) {
          if (state.tab === 'videos') return x.kind === 'video';
          return x.kind === 'image' || x.kind === 'gif';
        }) : [];
        if (!r || !r.ok) state.notice = t('picker.noBackend');
        paint();
      });
    }
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-tab]');
      if (!b) return;
      $$('.pt', box).forEach(function (x) { x.classList.toggle('is-on', x === b); });
      state.tab = b.dataset.tab;
      if (state.tab === 'videos' || state.tab === 'images') fetchTab(); else paint();
    });
    fetchTab();
  }

  /* ══════════ 設定 ══════════ */
  function mountSettings() {
    var host = $('#panel-settings');
    host.innerHTML = '';
    host.appendChild(el('<div class="set-card"><h3>' + t('settings.account') + '</h3>' +
      '<div class="set-row"><span class="ava lg">' + U.esc(S.user.username.slice(0, 1)) + '</span><div><b>' + U.esc(S.user.username) + '</b>' +
      '<i>' + U.esc(t(isAdmin() ? 'settings.roleAdmin' : 'settings.roleMember') + ' · ' + backendLabel()) + '</i></div>' +
      (isAdmin() ? '<span class="badge">' + t('settings.roleAdmin') + '</span>' : '') + '</div>' +
      '</div>'));

    // 語言
    var langCard = el('<div class="set-card"><h3>' + t('settings.language') + '</h3><div class="seg" id="set-lang">' +
      '<button type="button" data-lang="zh" class="' + (I18N.lang === 'zh' ? 'is-on' : '') + '">中文</button>' +
      '<button type="button" data-lang="en" class="' + (I18N.lang === 'en' ? 'is-on' : '') + '">English</button></div>' +
      '<p class="set-hint">' + t('lang.sub') + '</p></div>');
    langCard.querySelector('#set-lang').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-lang]'); if (!b) return;
      if (b.dataset.lang === I18N.lang) return;
      API.lang.set(b.dataset.lang); I18N.set(b.dataset.lang); markLang(b.dataset.lang);
      applyI18n(); toast(t('settings.saved'), 'ok');
      TR.waterDrop().then(function () { applyI18n(); mountSettings(); });
    });
    host.appendChild(langCard);

    // 最愛角色／進場動畫
    var favCard = el('<div class="set-card"><h3>' + t('settings.character') + '</h3>' +
      '<p class="set-hint">' + (S.user.favorite ? t('fav.selected', { name: I18N.charName(charById(S.user.favorite)) }) : t('settings.characterNone')) + '</p>' +
      '<div class="chip-grid" id="set-fav"></div><p class="set-hint">' + t('fav.videoNote') + '</p></div>');
    var cg = favCard.querySelector('#set-fav');
    CHARS.forEach(function (c) {
      var b = el('<button type="button" class="chip-c' + (S.user.favorite === c.id ? ' is-on' : '') + '" data-id="' + c.id + '" style="--c1:' + c.c1 + ';--c2:' + c.c2 + '">' +
        '<span>' + (c.glyph || '✦') + '</span><b>' + U.esc(I18N.charName(c)) + '</b><i>' + (S.videos[c.id] ? '▶' : '') + '</i></button>');
      b.onclick = function (ev) {
        if (S.busy) return;
        S.busy = true;
        API.setFavorite(c.id).then(function (r) {
          S.busy = false;
          if (!r.ok) return toast(API.errText(r, t), 'bad');
          S.user.favorite = r.favorite; rememberMe(S.user);
          if (r.votes) S.votes = r.votes;
          toast(t('settings.saved'), 'ok');
          mountSettings(); renderTopMe();
          TR.character(c);
        });
      };
      cg.appendChild(b);
    });
    host.appendChild(favCard);

    // 自動登入／登出
    var acc = el('<div class="set-card"><h3>' + t('settings.autologin') + '</h3>' +
      '<label class="switch"><input type="checkbox" id="set-remember" ' + (API.remember() ? 'checked' : '') + '><span></span></label>' +
      '<p class="set-hint">' + t(API.remember() ? 'settings.autologinOn' : 'settings.autologinOff') + '</p>' +
      '<div class="set-row"><button type="button" class="btn btn-danger" id="set-logout">' + ICON.out + '<span>' + t('settings.logout') + '</span></button></div></div>');
    acc.querySelector('#set-remember').addEventListener('change', function (ev) {
      API.setToken(API.token(), ev.target.checked);
      toast(t('settings.saved'), 'ok');
      mountSettings();
    });
    acc.querySelector('#set-logout').onclick = doLogout;
    host.appendChild(acc);

    // 雲端影片 / 連線
    var vidCard = el('<div class="set-card"><h3>' + t('settings.videos') + '</h3>' +
      '<p class="set-hint">' + (Object.keys(S.videos).length ? t('settings.videosFound', { count: Object.keys(S.videos).length }) : t('settings.videosNone')) + '</p>' +
      '<div class="set-row"><button type="button" class="btn btn-ghost" id="set-video-refresh">' + t('settings.videosRefresh') + '</button></div>' +
      '<div class="set-row"><button type="button" class="btn btn-ghost" id="set-backend-check">' + t('settings.check') + '</button></div>' +
      '<div id="set-stats"></div></div>');
    vidCard.querySelector('#set-video-refresh').onclick = function () {
      btnBusy('#set-video-refresh', true);
      loadCharVideos(true).then(function (r) { btnBusy('#set-video-refresh', false); toast(r && Object.keys(S.videos).length ? t('settings.videosFound', { count: Object.keys(S.videos).length }) : t('settings.videosNone'), 'ok'); mountSettings(); });
    };
    vidCard.querySelector('#set-backend-check').onclick = function () {
      btnBusy('#set-backend-check', true);
      netCheck(true).then(function (st) {
        btnBusy('#set-backend-check', false);
        var msg = st === 'ok' ? t('settings.backendCloud') : (st === 'local' ? t('settings.backendLocal') : t('err.network'));
        toast(msg, (st === 'ok' || st === 'local') ? 'ok' : 'bad');
        updateModeBanner(); mountSettings(); renderTopMe();
      });
    };
    if (isAdmin()) {
      API.stats().then(function (r) {
        if (!r || !r.ok) return;
        $('#set-stats').innerHTML = '<h4 class="set-sub">' + t('settings.stats') + '</h4><div class="stat-row">' +
          '<span>' + t('settings.statsUsers', { count: r.users }) + '</span>' +
          '<span>' + t('settings.statsPosts', { count: r.posts }) + '</span>' +
          '<span>' + t('settings.statsVotes', { count: (r.votes && r.votes.total) || 0 }) + '</span></div>';
      });
    }
    host.appendChild(vidCard);
    revealObserve();
  }

  function doLogout() {
    confirmBox(t('settings.logoutConfirm')).then(function (yes) {
      if (!yes) return;
      return API.logout().then(function () {
        S.user = null; S.posts = []; S.panel = 'feed';
        try { localStorage.removeItem('xx.me'); } catch (e) { }
        $('#feed').innerHTML = '';
        showScreen('account');
        setTab('login');
        TR.swordPass('#ff9ec4');
      });
    });
  }

  /* ══════════ 建議 ══════════ */
  function mountSuggest() {
    var host = $('#panel-suggest');
    host.innerHTML = '';
    var card = el('<div class="set-card"><h3>' + t('panel.suggest.title') + '</h3>' +
      '<p class="set-hint">' + t('suggest.onlyText') + '</p>' +
      '<textarea id="sg-text" rows="6" maxlength="' + CFG.site.suggestMax + '" placeholder="' + U.esc(t('suggest.placeholder')) + '"></textarea>' +
      '<div class="sg-foot"><span id="sg-count">0 / ' + CFG.site.suggestMax + '</span>' +
      '<button type="button" class="btn btn-primary" id="sg-send">' + ICON.send + '<span>' + t('suggest.submit') + '</span></button></div>' +
      '<h4 class="set-sub">' + t('suggest.history') + '</h4><div id="sg-list"></div></div>');
    host.appendChild(card);
    var ta = card.querySelector('#sg-text');
    ta.addEventListener('input', function () { $('#sg-count').textContent = ta.value.length + ' / ' + CFG.site.suggestMax; autoGrow(ta); });
    card.querySelector('#sg-send').onclick = function () {
      var v = ta.value.trim();
      if (!v) return toast(t('suggest.need'), 'bad');
      btnBusy('#sg-send', true);
      API.suggest(v).then(function (r) {
        btnBusy('#sg-send', false);
        if (!r || !r.ok) return toast(API.errText(r || { error: 'NETWORK' }, t), 'bad');
        ta.value = ''; $('#sg-count').textContent = '0 / ' + CFG.site.suggestMax;
        toast(t('suggest.done'), 'ok');
        paintHistory();
      });
    };
    function paintHistory() {
      API.mySuggestions().then(function (r) {
        var list = $('#sg-list');
        list.innerHTML = '';
        var arr = (r && r.entries) || [];
        if (!arr.length) { list.appendChild(emptyState(t('suggest.empty'), '')); return; }
        arr.forEach(function (e) {
          list.appendChild(el('<div class="sg-item"><b>' + U.esc(ago(e.createdAt)) + '</b><p>' + U.esc(e.text) + '</p></div>'));
        });
      });
    }
    paintHistory();
    revealObserve();
  }

  /* ══════════ 捲動揭露動畫 ══════════ */
  var io = null;
  function revealObserve() { $$('.post:not(.seen), .set-card:not(.seen)').forEach(revealOne); }
  function revealOne(n) {
    if (n.classList.contains('seen')) return;
    if (TR.reduced()) { n.classList.add('seen'); return; }
    if (!io) io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    io.observe(n);
  }

  /* ══════════ 輪詢更新 ══════════ */
  function startPoll() {
    stopPoll();
    var ms = CFG.backend.pollMs;
    if (!ms) return;
    S.poll = setInterval(function () {
      if (document.hidden || S.screen !== 'home' || S.panel !== 'feed') return;
      API.getFeed(1, 12).then(function (r) {
        if (!r || !r.ok || !r.posts) return;
        var byId = {};
        r.posts.forEach(function (p) { byId[p.id] = p; });
        var news = r.posts.filter(function (p) { return !S.posts.some(function (x) { return x.id === p.id; }); });
        S.posts.forEach(function (p) {
          var f = byId[p.id];
          if (!f) return;
          p.likes = f.likes; p.comments = f.comments;
          var node = $('.post[data-id="' + p.id + '"]');
          if (node) {
            $('.post-likes', node).innerHTML = likeText(p);
            var liked = S.user && p.likes.indexOf(S.user.username) >= 0;
            var btn = $('[data-act=like]', node);
            btn.classList.toggle('is-on', liked);
            btn.innerHTML = (liked ? ICON.heartFill : ICON.heart) + '<span>' + t(liked ? 'post.unlike' : 'post.like') + '</span>';
            if (S.expanded[p.id]) renderComments(node, p);
          }
        });
        if (news.length) {
          var foot = $('#feed-foot');
          if (!$('#new-chip', foot)) {
            var chip = el('<button type="button" class="new-chip" id="new-chip">' + t('feed.newPosts', { count: news.length }) + '</button>');
            chip.onclick = function () { chip.remove(); loadFeed(true); };
            foot.insertBefore(chip, foot.firstChild);
          }
        }
        loadVotes();
      });
    }, ms);
  }
  function stopPoll() { if (S.poll) clearInterval(S.poll); S.poll = 0; }

  /* ══════════ 彈窗 / 吐司 ══════════ */
  function openModal(o) {
    var wrap = el('<div class="modal-wrap" role="dialog" aria-modal="true"><div class="modal' + (o.wide ? ' wide' : '') + '">' +
      '<header><b>' + U.esc(o.title || '') + '</b><button type="button" class="icon-btn close">' + ICON.close + '</button></header>' +
      '<div class="modal-body"></div></div></div>');
    wrap.querySelector('.modal-body').appendChild(o.body);
    $('#modal-root').appendChild(wrap);
    document.body.classList.add('has-modal');
    function close() {
      wrap.classList.add('is-closing');
      setTimeout(function () { wrap.remove(); document.body.classList.remove('has-modal'); }, M(240));
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    wrap.querySelector('.close').onclick = close;
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () { wrap.classList.add('is-open'); });
    return { el: wrap, close: close };
  }
  function confirmBox(text) {
    return new Promise(function (res) {
      var box = el('<div class="confirm"><p>' + U.esc(text) + '</p><div class="cf-btns">' +
        '<button type="button" class="btn btn-ghost" data-no>' + t('common.cancel') + '</button>' +
        '<button type="button" class="btn btn-danger" data-yes>' + t('common.confirm') + '</button></div></div>');
      var m = openModal({ title: brandName(), body: box });
      box.querySelector('[data-no]').onclick = function () { m.close(); res(false); };
      box.querySelector('[data-yes]').onclick = function () { m.close(); res(true); };
    });
  }
  function toast(msg, kind) {
    var n = el('<div class="toast ' + (kind || '') + '">' + U.esc(msg) + '</div>');
    $('#toast-root').appendChild(n);
    requestAnimationFrame(function () { n.classList.add('is-on'); });
    setTimeout(function () { n.classList.remove('is-on'); setTimeout(function () { n.remove(); }, 380); }, 2600);
  }

  /* ══════════ 事件綁定 ══════════ */
  function bindStatic() {
    $('#lang-zh').onclick = function (e) { chooseLang('zh', e); };
    $('#lang-en').onclick = function (e) { chooseLang('en', e); };
    $('#tab-register').onclick = function () { setTab('register'); };
    $('#tab-login').onclick = function () { setTab('login'); };
    $('#goto-login').onclick = function () { setTab('login'); };
    $('#goto-register').onclick = function () { setTab('register'); };
    $('#form-register').addEventListener('submit', submitRegister);
    $('#form-login').addEventListener('submit', submitLogin);
    $('#fav-grid').addEventListener('click', function (ev) {
      var c = ev.target.closest('.fav-card');
      if (c) pickFavorite(c.dataset.id, ev);
    });
    $('#fav-skip').onclick = function () { showScreen('home'); mountHome(); };
    $('#btn-refresh').onclick = function () { loadFeed(true).then(function () { loadVotes(); toast(t('feed.refreshed'), 'ok'); }); };
    $('#btn-lang').onclick = function () {
      var box = el('<div class="lang-mini"><button type="button" data-lang="zh">中文</button><button type="button" data-lang="en">English</button></div>');
      var m = openModal({ title: t('settings.language'), body: box });
      box.onclick = function (ev) {
        var b = ev.target.closest('[data-lang]'); if (!b) return;
        m.close();
        API.lang.set(b.dataset.lang); I18N.set(b.dataset.lang); markLang(b.dataset.lang); applyI18n();
        TR.waterDrop().then(function () { applyI18n(); if (S.screen === 'home') mountHome(); });
      };
    };
    $('#mode-banner-act').onclick = function () { openModal({ title: t('mode.howto'), body: howtoBody() }); };
    $('#intro').addEventListener('click', function () { TR.skipIntro(); });
    /* 卡住救援：按鈕 + 快捷鍵（Shift＋L 隨時強制回登入畫面）*/
    $('#rescue-login').onclick = function () { forceLoginScreen(t('recovery.manual')); };
    $('#rescue-calm').onclick = function () { calmOn(true); };
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'L' || e.key === 'l') && (e.shiftKey || (e.ctrlKey && e.altKey))) {
        var tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;   // 打字時不觸發
        e.preventDefault();
        forceLoginScreen(t('recovery.manual'));
      }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && S.screen === 'lang') chooseLang(I18N.lang || 'zh'); });
    window.addEventListener('beforeunload', stopPoll);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && S.screen === 'home') startPoll(); });
  }

  window.XXApp = { boot: boot, state: S, t: t, applyI18n: applyI18n };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
