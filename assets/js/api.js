/* ══════════════════════════════════════════════════════════════════════
   修仙也要拍 · 資料層 (api.js)
   ─ cloud : Google Apps Script + Google Drive（帳號/按讚/留言/建議）
   ─ local : 示範模式，資料存在 localStorage + IndexedDB
   兩套實作相同介面，app.js 不用在意差異。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = window.XX_CONFIG;
  var LS_DB = 'xx.local.db.v1';
  var LS_TOKEN = 'xx.token';
  var LS_ME = 'xx.me';
  var LS_LANG = 'xx.lang';
  var DB_NAME = 'xiuxian-media', DB_STORE = 'blobs';

  /* ══════════ Util ══════════ */
  var Util = {
    uid: function (p) {
      return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },
    now: function () { return new Date().toISOString(); },
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    clamp: function (n, a, b) { return Math.max(a, Math.min(b, n)); },
    /** 名稱驗證：中英日韓＋數字，2–20 字，禁止空白與特殊符號 */
    NAME_RE: (function () {
      try { return new RegExp('^[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{L}\\p{N}]{2,20}$', 'u'); }
      catch (e) {
        // 舊瀏覽器退路：CJK 區段＋字母＋數字
        return /^[A-Za-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\u00c0-\u024f]{2,20}$/;
      }
    })(),
    validName: function (n) {
      n = String(n || '');
      if (!n) return 'err.nameRequired';
      if (/\s/.test(n)) return 'err.nameInvalid';
      if (n.length < 2 || n.length > 20) return 'err.nameLen';
      if (!Util.NAME_RE.test(n)) return 'err.nameInvalid';
      return null;
    },
    /** 從 Google Drive 連結解析檔案 ID（也接受直接給 ID） */
    driveId: function (link) {
      var s = String(link || '').trim();
      if (!s) return null;
      var m = s.match(/[-\w]{25,}/);
      return m ? m[0] : null;
    },
    kindOf: function (name, mime, forced) {
      if (forced && forced !== 'auto') return forced;
      var n = String(name || '').toLowerCase(), t = String(mime || '').toLowerCase();
      if (t === 'image/gif' || /\.gif$/.test(n)) return 'gif';
      if (t.indexOf('video/') === 0 || /\.(mp4|webm|mov|m4v|mkv|avi)$/.test(n)) return 'video';
      if (t.indexOf('image/') === 0 || /\.(png|jpe?g|webp|avif|bmp|gif)$/.test(n)) return 'image';
      return null;
    },
    extSafe: function (name) {
      return String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';
    },
    dataUrlBytes: function (du) {
      var i = String(du || '').indexOf(',');
      if (i < 0) return 0;
      var b64 = du.slice(i + 1).replace(/\s/g, '');
      var pad = b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0);
      return Math.floor(b64.length * 3 / 4) - pad;
    },
    readFileAsDataUrl: function (file) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(String(fr.result)); };
        fr.onerror = function () { rej(new Error('READ_FAIL')); };
        fr.readAsDataURL(file);
      });
    },
    /** 純 JS SHA-256（file:// 沒有 crypto.subtle 時也能用） */
    sha256: (function () {
      var K = [0x428a2f98, 0x7106809f, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c35719, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
      function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
      return function (str) {
        var bytes = [], i;
        for (i = 0; i < str.length; i++) {
          var c = str.charCodeAt(i);
          if (c < 0x80) bytes.push(c);
          else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
          else if (c < 0xd800 || c >= 0xe000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
          else { i++; var cc = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
            bytes.push(0xf0 | (cc >> 18), 0x80 | ((cc >> 12) & 63), 0x80 | ((cc >> 6) & 63), 0x80 | (cc & 63)); }
        }
        var l = bytes.length, bitLen = l * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) bytes.push(0);
        var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
        bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
          (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
        var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        var w = new Array(64);
        for (var off = 0; off < bytes.length; off += 64) {
          for (i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
          for (i = 16; i < 64; i++) {
            var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
          }
          var a = H[0], b = H[1], c2 = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
          for (i = 0; i < 64; i++) {
            var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            var ch = (e & f) ^ (~e & g);
            var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
            var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            var maj = (a & b) ^ (a & c2) ^ (b & c2);
            var t2 = (S0 + maj) | 0;
            h = g; g = f; f = e; e = (d + t1) | 0; d = c2; c2 = b; b = a; a = (t1 + t2) | 0;
          }
          H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c2) | 0; H[3] = (H[3] + d) | 0;
          H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
        }
        var hex = '';
        for (i = 0; i < 8; i++) hex += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
        return hex;
      };
    })(),
    salt: function () {
      var s = '';
      for (var i = 0; i < 8; i++) s += Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
      return s;
    },
    token: function () {
      var s = '';
      for (var i = 0; i < 4; i++) s += Math.random().toString(36).slice(2) + Date.now().toString(36).slice(-3);
      return s.slice(0, 40);
    }
  };

  /* ══════════ IndexedDB 本機媒體 ══════════ */
  var BlobStore = {
    _db: null, urls: {},
    open: function () {
      if (this._db) return Promise.resolve(this._db);
      return new Promise(function (res) {
        if (!window.indexedDB) return res(null);
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(DB_STORE); };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { res(null); };
      });
    },
    put: function (id, blob) {
      var self = this;
      return this.open().then(function (db) {
        if (!db) throw new Error('NO_IDB');
        return new Promise(function (res, rej) {
          var tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(blob, id);
          tx.oncomplete = function () { res(id); };
          tx.onerror = function () { rej(tx.error); };
        });
      }).catch(function () { return null; });
    },
    url: function (id) {
      var self = this;
      if (this.urls[id]) return Promise.resolve(this.urls[id]);
      return this.open().then(function (db) {
        if (!db) return null;
        return new Promise(function (res) {
          var tx = db.transaction(DB_STORE, 'readonly');
          var r = tx.objectStore(DB_STORE).get(id);
          r.onsuccess = function () {
            var blob = r.result;
            if (!blob) return res(null);
            var u = URL.createObjectURL(blob);
            self.urls[id] = u;
            res(u);
          };
          r.onerror = function () { res(null); };
        });
      });
    }
  };

  /* ══════════ 本機示範資料庫 ══════════ */
  var Local = {
    db: null,
    load: function () {
      if (this.db) return this.db;
      var raw = null;
      try { raw = localStorage.getItem(LS_DB); } catch (e) { raw = null; }
      try { this.db = raw ? JSON.parse(raw) : null; } catch (e) { this.db = null; }
      if (!this.db || this.db.v !== 1) {
        this.db = { v: 1, users: {}, sessions: {}, votes: { counts: {}, voters: {} }, posts: [], suggestions: {}, media: {}, created: Util.now() };
        var ids = {}; CFG.characters.forEach(function (c) { ids[c.id] = 0; });
        this.db.votes.counts = ids;
        this.seedAdmin();
        this.save();
      }
      return this.db;
    },
    save: function () {
      try { localStorage.setItem(LS_DB, JSON.stringify(this.db)); }
      catch (e) { console.warn('[xx] localStorage 空間不足', e); }
    },
    seedAdmin: function () {
      var salt = Util.salt(), admin = CFG.admin.username;
      this.db.users[admin.toLowerCase()] = {
        name: admin, role: 'admin', fav: null, created: Util.now(),
        salt: salt, hash: Util.sha256(salt + ':' + 'Rorkey@0820')
      };
    },
    key: function (name) { return String(name || '').toLowerCase(); },
    user: function (name) { return this.load().users[this.key(name)] || null; },
    makeSession: function (name, remember) {
      var t = Util.token();
      this.db.sessions[t] = { name: name, expires: Date.now() + (remember ? 30 : 1) * 864e5 };
      this.save();
      return { token: t, expires: this.db.sessions[t].expires };
    },
    sessionUser: function (token) {
      var db = this.load(), s = token && db.sessions[token];
      if (!s) return null;
      if (s.expires < Date.now()) { delete db.sessions[token]; this.save(); return null; }
      var u = this.user(s.name);
      return u ? { username: u.name, role: u.role, favorite: u.fav || null } : null;
    },
    counts: function () {
      var db = this.load(), out = {};
      CFG.characters.forEach(function (c) { out[c.id] = db.votes.counts[c.id] || 0; });
      var total = 0; for (var k in out) total += out[k];
      return { counts: out, total: total };
    }
  };

  /* ══════════ 共用回傳工具 ══════════ */
  function ok(o) { o = o || {}; o.ok = true; return o; }
  function fail(code, msg) { return { ok: false, error: code, message: msg || '' }; }

  /* ══════════ 本機動作實作 ══════════ */
  var localActions = {
    init: function () {
      var db = Local.load();
      return ok({ version: 'local-1.0.0', adminExists: !!Local.user(CFG.admin.username), counts: { posts: db.posts.length, users: Object.keys(db.users).length } });
    },
    register: function (p) {
      var db = Local.load();
      var err = Util.validName(p.username);
      if (err) return fail(err === 'err.nameLen' ? 'USERNAME_INVALID' : (err === 'err.nameRequired' ? 'USERNAME_INVALID' : 'USERNAME_INVALID'), err);
      if (Local.key(p.username) === Local.key(CFG.admin.username)) return fail('NAME_RESERVED', 'err.nameReserved');
      if (Local.user(p.username)) return fail('USERNAME_TAKEN', 'err.nameExists');
      if (!p.password || String(p.password).length < 6) return fail('PASSWORD_WEAK', 'err.pwShort');
      var salt = Util.salt();
      db.users[Local.key(p.username)] = { name: p.username, role: 'member', fav: null, created: Util.now(), salt: salt, hash: Util.sha256(salt + ':' + p.password) };
      var s = Local.makeSession(p.username, p.remember);
      Local.save();
      return ok({ token: s.token, expiresAt: new Date(s.expires).toISOString(), user: { username: p.username, role: 'member', favorite: null } });
    },
    login: function (p) {
      var u = Local.user(p.username);
      if (!u || u.hash !== Util.sha256(u.salt + ':' + String(p.password || ''))) return fail('BAD_CREDENTIALS', 'err.badCredentials');
      var s = Local.makeSession(u.name, p.remember);
      return ok({ token: s.token, expiresAt: new Date(s.expires).toISOString(), user: { username: u.name, role: u.role, favorite: u.fav || null } });
    },
    logout: function (p) { delete Local.load().sessions[p.token]; Local.save(); return ok(); },
    whoami: function (p) {
      var me = Local.sessionUser(p.token);
      return me ? ok({ user: me }) : fail('NOT_SIGNED_IN', 'err.notSignedIn');
    },
    setFavorite: function (p) {
      var db = Local.load(), me = Local.sessionUser(p.token);
      if (!me) return fail('NOT_SIGNED_IN');
      var ids = {}; CFG.characters.forEach(function (c) { ids[c.id] = 1; });
      if (!ids[p.characterId]) return fail('BAD_REQUEST');
      var u = Local.user(me.username);
      if (u.fav && db.votes.counts[u.fav]) db.votes.counts[u.fav]--;
      if (db.votes.voters[me.username] !== p.characterId) {
        db.votes.counts[p.characterId] = (db.votes.counts[p.characterId] || 0) + 1;
        db.votes.voters[me.username] = p.characterId;
      }
      u.fav = p.characterId;
      Local.save();
      return ok({ votes: Local.counts(), favorite: p.characterId });
    },
    getVotes: function () { return ok({ votes: Local.counts() }); },
    getFeed: function (p) {
      var db = Local.load();
      var page = p && p.page || 1, size = p && p.pageSize || 12;
      var start = (page - 1) * size;
      return ok({ posts: db.posts.slice(start, start + size), page: page, pageSize: size, total: db.posts.length, hasMore: start + size < db.posts.length });
    },
    createPost: function (p) {
      var db = Local.load(), me = Local.sessionUser(p.token);
      if (!me) return fail('NOT_SIGNED_IN');
      if (me.role !== 'admin') return fail('NOT_ADMIN', 'err.notAdmin');
      return Promise.resolve(saveLocalMedia(p.media)).then(function (media) {
        if (!media) return fail('BAD_REQUEST', 'composer.needMedia');
        var post = {
          id: Util.uid('p'), kind: media.kind || p.kind || 'video', author: me.username, authorRole: 'admin',
          createdAt: Util.now(), caption: String(p.caption || '').slice(0, CFG.site.postCaptionMax),
          media: media, likes: [], comments: []
        };
        db.posts.unshift(post); Local.save();
        return ok({ post: post });
      });
    },
    deletePost: function (p) {
      var db = Local.load(), me = Local.sessionUser(p.token);
      if (!me || me.role !== 'admin') return fail('NOT_ADMIN');
      db.posts = db.posts.filter(function (x) { return x.id !== p.postId; });
      Local.save();
      return ok({ postId: p.postId });
    },
    toggleLike: function (p) {
      var db = Local.load(), me = Local.sessionUser(p.token);
      if (!me) return fail('NOT_SIGNED_IN');
      var post = db.posts.filter(function (x) { return x.id === p.postId; })[0];
      if (!post) return fail('NOT_FOUND');
      var i = post.likes.indexOf(me.username);
      if (i >= 0) post.likes.splice(i, 1); else post.likes.push(me.username);
      Local.save();
      return ok({ postId: post.id, likeCount: post.likes.length, liked: i < 0, post: post });
    },
    addComment: function (p) {
      var db = Local.load(), me = Local.sessionUser(p.token);
      if (!me) return fail('NOT_SIGNED_IN');
      var post = db.posts.filter(function (x) { return x.id === p.postId; })[0];
      if (!post) return fail('NOT_FOUND');
      return Promise.resolve(saveLocalMedia(p.media)).then(function (media) {
        if (!p.text && !media) return fail('BAD_REQUEST', 'post.commentNeed');
        post.comments.push({
          id: Util.uid('c'), user: me.username,
          kind: media ? (media.kind || 'image') : 'text',
          text: String(p.text || '').slice(0, CFG.site.commentMax),
          media: media || null, createdAt: Util.now()
        });
        Local.save();
        return ok({ post: post });
      });
    },
    deleteComment: function (p) {
      var db = Local.load(), me = Local.sessionUser(p.token);
      if (!me) return fail('NOT_SIGNED_IN');
      var post = db.posts.filter(function (x) { return x.id === p.postId; })[0];
      if (!post) return fail('NOT_FOUND');
      post.comments = post.comments.filter(function (c) { return !(c.id === p.commentId && (me.role === 'admin' || c.user === me.username)); });
      Local.save();
      return ok({ post: post });
    },
    listDriveMedia: function (p) {
      // 示範模式：列出本機上傳過的媒體（雲端資料夾需要後端或 API 金鑰）
      var db = Local.load(), arr = Object.keys(db.media).map(function (k) { return db.media[k]; });
      return ok({ media: arr.filter(function (m) { return p.folder !== 'videos' || m.kind === 'video'; }) });
    },
    listCloudMedia: function (folder) {
      var key = CFG.drive.apiKey;
      var folderId = folder === 'videos' ? CFG.drive.videosFolderId : CFG.drive.commentsFolderId;
      if (!key) return Promise.resolve(fail('NO_KEY', 'picker.noBackend'));
      var q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
      var url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
        '&fields=' + encodeURIComponent('files(id,name,mimeType,size,modifiedTime)') +
        '&orderBy=' + encodeURIComponent('modifiedTime desc') + '&pageSize=100&key=' + encodeURIComponent(key);
      return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.files) return fail('NOT_FOUND', j.error && j.error.message);
        return ok({ media: j.files.map(function (f) {
          return { fileId: f.id, name: f.name, mime: f.mimeType, size: +(f.size || 0), createdAt: f.modifiedTime, kind: Util.kindOf(f.name, f.mimeType, 'auto') || 'other' };
        }) });
      }).catch(function (e) { return fail('NETWORK', String(e)); });
    },
    characterVideos: function () {
      var map = {}, cfgv = CFG.characterVideos || {};
      CFG.characters.forEach(function (c) {
        var ov = cfgv[c.id];
        if (ov && (ov.fileId || ov.url)) map[c.id] = { fileId: ov.fileId || '', url: ov.url || '', name: ov.name || c.id };
      });
      return ok({ map: map, folderId: CFG.drive.characterVideoFolderId, matched: Object.keys(map) });
    },
    submitSuggestion: function (p) {
      var db = Local.load(), me = Local.sessionUser(p.token);
      if (!me) return fail('NOT_SIGNED_IN');
      var t = String(p.text || '').trim();
      if (!t) return fail('BAD_REQUEST', 'suggest.need');
      var k = Local.key(me.username);
      db.suggestions[k] = db.suggestions[k] || [];
      db.suggestions[k].unshift({ createdAt: Util.now(), text: t.slice(0, CFG.site.suggestMax) });
      Local.save();
      return ok({ saved: me.username + '.txt' });
    },
    mySuggestions: function (p) {
      var me = Local.sessionUser(p.token);
      if (!me) return fail('NOT_SIGNED_IN');
      return ok({ entries: (Local.load().suggestions[Local.key(me.username)] || []).slice(0, 50) });
    },
    stats: function (p) {
      var me = Local.sessionUser(p.token);
      if (!me || me.role !== 'admin') return fail('NOT_ADMIN');
      var db = Local.load(), comments = 0;
      db.posts.forEach(function (x) { comments += x.comments.length; });
      return ok({ users: Object.keys(db.users).length, posts: db.posts.length, comments: comments, votes: Local.counts() });
    }
  };

  function saveLocalMedia(media) {
    if (!media) return null;
    if (media.dataUrl) {
      var bytes = Util.dataUrlBytes(media.dataUrl);
      if (bytes > CFG.site.maxUploadBytes) throw coded('tooBig', bytes);
      var id = Util.uid('m');
      var mime = (media.dataUrl.match(/^data:([^;]+)/) || [])[1] || 'application/octet-stream';
      return BlobStore.put(id, dataUrlToBlob(media.dataUrl)).then(function (saved) {
        var rec = { localId: saved || null, dataUrl: saved ? null : media.dataUrl, name: Util.extSafe(media.name || 'upload'), mime: mime, kind: Util.kindOf(media.name || '', mime, media.kind), size: bytes };
        Local.load().media[id] = rec; Local.save();
        return rec;
      });
    }
    if (media.fileId) return { fileId: media.fileId, name: Util.extSafe(media.name || media.fileId), mime: media.mime || '', kind: Util.kindOf(media.name || '', media.mime, media.kind) || guessFromId(media.fileId), size: media.size || 0 };
    if (media.url) {
      var id2 = Util.driveId(media.url);
      if (id2 && /drive\.google\.com|docs\.google\.com/.test(media.url)) return { fileId: id2, name: media.name || id2, kind: Util.kindOf(media.url, '', media.kind) || guessFromId(id2) };
      return { url: media.url, name: media.name || 'link', kind: Util.kindOf(media.url, '', media.kind) || 'image' };
    }
    return null;
  }
  function guessFromId(id) { return id ? 'video' : 'image'; }
  function coded(k, v) { var e = new Error(k); e.code = k; e.value = v; return e; }
  function dataUrlToBlob(du) {
    var parts = du.split(','), mime = (parts[0].match(/:(.*?);/) || [])[1] || '';
    var bin = atob(parts[1] || ''), n = bin.length, arr = new Uint8Array(n);
    while (n--) arr[n] = bin.charCodeAt(n);
    return new Blob([arr], { type: mime });
  }

  /* ══════════ 雲端 Apps Script 傳輸 ══════════ */
  function cloudUrl() {
    var u = (CFG.backend.appsScriptUrl || '').trim();
    if (u && !/\/exec$/.test(u) && u.indexOf('script.google') >= 0) u += (u.endsWith('/') ? '' : '/') + 'exec';
    return u;
  }
  function callCloud(action, payload) {
    var base = cloudUrl();
    if (!base) return Promise.resolve(fail('NO_BACKEND'));
    if (location.protocol === 'file:') return Promise.resolve(fail('FILE_ORIGIN', 'err.fileOrigin'));
    var body = JSON.stringify({ v: 1, action: action, payload: payload || {} });
    // 實測（Chrome → 部署後的 /exec）：瀏覽器 POST 的內文在 302 轉址時「整份遺失」，
    // 0.1KB／58KB／200KB／1MB／3MB／6MB 全都送不到，所以小的動作一律改走 GET；
    // 但 GET 有網址長度上限，幾 MB 的檔案絕對塞不進去 → 直接講清楚，
    // 不要讓它變成莫名的「連不上青羽門平台」。
    if ((action === 'createPost' || action === 'addComment') && payload && payload.media && payload.media.dataUrl) {
      return Promise.resolve(fail('CLOUD_UPLOAD', 'err.cloudUpload'));
    }
    if (encodeURIComponent(body).length > 6000) return Promise.resolve(fail('PAYLOAD_TOO_BIG', 'err.payloadBig'));
    var transport = CFG.backend.transport;
    var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(coded('timeout')); }, CFG.backend.timeoutMs); });

    function viaPost() {
      return fetch(base, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, redirect: 'follow' })
        .then(function (r) { return r.text(); })
        .then(function (txt) { return parse(txt); });
    }
    function viaGet() {
      var u = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'p=' + encodeURIComponent(body);
      return fetch(u, { method: 'GET' }).then(function (r) { return r.text(); }).then(parse);
    }
    function parse(txt) {
      var j;
      try { j = JSON.parse(txt); } catch (e) {
        // 通常是還沒設定「所有人可存取」→ 回傳了 HTML 登入頁
        if (/<\/?(html|head|title)/i.test(txt)) return fail('PERMISSION', 'appsScript');
        return fail('SERVER', txt.slice(0, 160));
      }
      // 後端沒讀到 POST 內文時會回「服務資訊」（有 actions 陣列）：
      // 這代表動作根本沒執行，一定要改用 GET ?p= 重送，不能當成成功。
      if (j && j.ok && Object.prototype.toString.call(j.actions) === '[object Array]') j.needGet = true;
      if (j && j.ok) return j;
      return j || fail('SERVER');
    }
    function normalize(r) {
      if (r && r.ok && r.needGet) return fail('BAD_REQUEST', 'echo');   // 绝對不能讓 ok:true 但沒有結果的回應混過去
      return r;
    }
    function retryGet(r) {
      return viaGet().then(function (r2) { return (r2 && (r2.ok || !r2.needGet)) ? r2 : r; });
    }
    var p;
    if (transport === 'get') p = viaGet();
    else if (transport === 'post') p = viaPost();
    else p = viaPost().then(function (r) {
      if (r && r.needGet) return retryGet(r);                       // POST 內文在 302 轉址時遺失 → 自動改 GET
      if (r && r.ok) return r;
      if (r && (r.error === 'BAD_REQUEST' || r.error === 'SERVER')) return retryGet(r);
      return r;
    });
    return Promise.race([p, timeout]).then(normalize).catch(function (e) {
      if (e && e.code === 'timeout') return fail('TIMEOUT', 'err.timeout');
      return fail('NETWORK', String(e && e.message || e));
    });
  }

  /* ══════════ 對外 API ══════════ */
  var Api = {
    util: Util, blobs: BlobStore,
    mode: function () { return cloudUrl() ? 'cloud' : 'local'; },
    hasBackend: function () { return !!cloudUrl(); },
    originBlocked: function () { return location.protocol === 'file:'; },
    call: function (action, payload) {
      payload = payload || {};
      // 重要：雲端與示範模式都要自動補上登入權杖，
      // 否則投票／建議／按讚／留言／發文會被後端判定「尚未登入」。
      if (!('token' in payload) && needsToken(action)) payload.token = this.token();
      if (this.mode() === 'cloud') {
        var self = this;
        return callCloud(action, payload).then(function (r) {
          if (r && !r.ok && (r.error === 'NOT_SIGNED_IN' || r.error === 'SESSION_EXPIRED')) self.clearToken();
          return r;
        });
      }
      var fn = localActions[action];
      if (!fn) return Promise.resolve(fail('NO_BACKEND', action));
      try { return Promise.resolve(fn(payload)); }
      catch (e) { return Promise.resolve(fail('SERVER', String(e && e.message || e))); }
    },
    /* ── 帳證 ── */
    init: function () { return this.call('init', {}); },
    register: function (name, pw, remember) {
      return this.call('register', { username: name, password: pw, remember: !!remember })
        .then(function (r) { if (r.ok) Api.setToken(r.token, remember); return r; });
    },
    login: function (name, pw, remember) {
      return this.call('login', { username: name, password: pw, remember: !!remember })
        .then(function (r) { if (r.ok) Api.setToken(r.token, remember); return r; });
    },
    logout: function () {
      var t = this.token();
      return this.call('logout', { token: t }).then(function (r) { Api.clearToken(); return r; });
    },
    whoami: function () {
      var self = this;
      if (!this.token()) return Promise.resolve(fail('NOT_SIGNED_IN'));
      return this.call('whoami', { token: this.token() }).then(function (r) {
        if (r.ok) { try { localStorage.setItem(LS_ME, JSON.stringify(r.user)); } catch (e) { } }
        else if (r.error === 'NOT_SIGNED_IN' || r.error === 'SESSION_EXPIRED') self.clearToken();
        return r;
      });
    },
    /* ── 角色 ── */
    setFavorite: function (id) { return this.call('setFavorite', { characterId: id }); },
    getVotes: function () { return this.call('getVotes', {}); },
    characterVideos: function (refresh) { return this.call('characterVideos', { refresh: !!refresh }); },
    /* ── 貼文互動 ── */
    getFeed: function (page, pageSize) { return this.call('getFeed', { page: page || 1, pageSize: pageSize || 12 }); },
    createPost: function (o) { return this.call('createPost', o); },
    deletePost: function (id) { return this.call('deletePost', { postId: id }); },
    toggleLike: function (id) { return this.call('toggleLike', { postId: id }); },
    addComment: function (postId, o) { return this.call('addComment', mix({ postId: postId }, o)); },
    deleteComment: function (postId, cid) { return this.call('deleteComment', { postId: postId, commentId: cid }); },
    listMedia: function (scope) {
      if (this.mode() === 'cloud') return this.call('listDriveMedia', { folder: scope });
      if (CFG.drive.apiKey) return localActions.listCloudMedia(scope);
      return this.call('listDriveMedia', { folder: scope });
    },
    /* ── 建議 ── */
    suggest: function (text) { return this.call('submitSuggestion', { text: text }); },
    mySuggestions: function () { return this.call('mySuggestions', {}); },
    stats: function () { return this.call('stats', {}); },

    /* ── Session 存放 ── */
    setToken: function (t, remember) {
      try {
        if (remember) { localStorage.setItem(LS_TOKEN, t); sessionStorage.removeItem(LS_TOKEN); }
        else { sessionStorage.setItem(LS_TOKEN, t); localStorage.removeItem(LS_TOKEN); }
      } catch (e) { }
    },
    token: function () {
      try { return localStorage.getItem(LS_TOKEN) || sessionStorage.getItem(LS_TOKEN) || ''; } catch (e) { return ''; }
    },
    remember: function () { try { return !!localStorage.getItem(LS_TOKEN); } catch (e) { return false; } },
    clearToken: function () {
      try { localStorage.removeItem(LS_TOKEN); sessionStorage.removeItem(LS_TOKEN); } catch (e) { }
    },
    cachedMe: function () { try { return JSON.parse(localStorage.getItem(LS_ME) || 'null'); } catch (e) { return null; } },
    lang: {
      get: function () { try { return localStorage.getItem(LS_LANG) || ''; } catch (e) { return ''; } },
      set: function (v) { try { localStorage.setItem(LS_LANG, v); } catch (e) { } }
    },

    /* ── 媒體播放來源（Drive 播放策略）── */
    playback: function (media) {
      if (!media) return { kind: 'text', candidates: [], iframe: null };
      var kind = media.kind || Util.kindOf(media.name || '', media.mime || '', 'auto') || 'image';
      if (media.localId || media.dataUrl) return { kind: kind, localId: media.localId, dataUrl: media.dataUrl, candidates: [], iframe: null };
      if (media.url) return { kind: kind, candidates: [media.url], iframe: null, directUrl: media.url };
      var id = media.fileId;
      if (!id) return { kind: kind, candidates: [], iframe: null };
      var c = [], mode = CFG.drive.playback, key = CFG.drive.apiKey;
      if (kind === 'image' || kind === 'gif') {
        c.push('https://drive.google.com/thumbnail?id=' + id + '&sz=w1600');
        c.push('https://lh3.googleusercontent.com/d/' + id + '=w1600');
        if (key && mode !== 'preview') c.push('https://www.googleapis.com/drive/v3/files/' + id + '/media?key=' + encodeURIComponent(key));
        c.push('https://drive.google.com/uc?export=download&id=' + id);
      } else {
        if (key && mode !== 'preview') c.push('https://www.googleapis.com/drive/v3/files/' + id + '/media?key=' + encodeURIComponent(key));
        if (mode !== 'preview') c.push('https://drive.google.com/uc?export=download&id=' + id);
      }
      return { kind: kind, fileId: id, candidates: c, iframe: 'https://drive.google.com/file/d/' + id + '/preview' };
    }
  };

  function needsToken(a) {
    return ['setFavorite', 'createPost', 'deletePost', 'toggleLike', 'addComment', 'deleteComment',
      'submitSuggestion', 'mySuggestions', 'stats', 'listDriveMedia'].indexOf(a) >= 0;
  }
  function mix(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  /* 錯誤代碼 → 語言檔 key */
  Api.errKey = function (r) {
    if (!r) return 'err.generic';
    var m = { USERNAME_INVALID: 'err.nameInvalid', USERNAME_TAKEN: 'err.nameExists', NAME_RESERVED: 'err.nameReserved',
      PASSWORD_WEAK: 'err.pwShort', BAD_CREDENTIALS: 'err.badCredentials', NOT_SIGNED_IN: 'err.notSignedIn',
      SESSION_EXPIRED: 'err.notSignedIn', NOT_ADMIN: 'err.notAdmin', FORBIDDEN: 'err.notAdmin',
      NETWORK: 'err.network', TIMEOUT: 'err.timeout', BUSY: 'err.timeout', NOT_FOUND: 'err.notFound',
      FILE_ORIGIN: 'err.fileOrigin',
      FILE_NOT_FOUND: 'err.notFound', POST_NOT_FOUND: 'err.notFound', COMMENT_NOT_FOUND: 'err.notFound',
      FOLDER_NOT_FOUND: 'err.network', PERMISSION: 'err.network', NO_KEY: 'picker.noBackend',
      UPLOAD_TOO_LARGE: 'err.tooBig', UPLOAD_EMPTY: 'composer.needMedia', SUGGESTION_TOO_LONG: 'err.generic',
      CLOUD_UPLOAD: 'err.cloudUpload', PAYLOAD_TOO_BIG: 'err.payloadBig',
      MEDIA_FOLDER_NOT_ALLOWED: 'err.notFound', UNKNOWN_ACTION: 'err.generic', BAD_REQUEST: 'err.generic' };
    return m[r.error] || 'err.generic';
  };
  Api.errText = function (r, t) {
    var key = (r && r.message && /^err\.|^(suggest|post|composer|picker|login|signup)\./.test(r.message)) ? r.message : Api.errKey(r);
    return t(key, { message: (r && r.message) || (r && r.error) || '' });
  };

  window.XXApi = Api;
  window.XXUtil = Util;
}());
