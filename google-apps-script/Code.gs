/******************************************************************************
 * 修仙也要拍 (XiuXian Also Films) — Google Apps Script 後端 (Code.gs)
 * 版本 VERSION 1.0.0
 *
 * ---------------------------------------------------------------------------
 * 一、部署步驟（作者請照做）
 * ---------------------------------------------------------------------------
 * 1. 打開 Google Drive → 新增 → Apps Script 指令碼（或對任何檔案「進階指令碼編輯器」）。
 * 2. 把本檔所有内容貼到 Code.gs，儲存（Ctrl+S）。
 * 3. 上方「安裝設定 → 處理程序」→「新式 Apps Script 體驗版」，執行時環境為 V8。
 * 4. 「Deploy（部署）→ New deployment（新部署）→ ⚙ 選擇類型 → Web app（網頁應用程式）」
 *      - Description：任意（例 xiuxian-yaopai v1）
 *      - Execute as（執行身分）：Me（我）
 *      - Who has access（使用者）：Anyone（任何人）  ← 必須是 Anyone，不能是 Anyone with Google account
 * 5. 首次部署會要求授權（ authorize ），選「進階 → 前往專案（unsafe）→ 允許」，
 *    授權範圍是 Drive（讀寫 Drive 資料夾）。
 * 6. 複製產生的 Web app URL（.../exec），填進前端 assets/js/config.js 的 backend.appsScriptUrl。
 * 7. 之後每次改過 Code.gs，都要「Manage deployments → Edit → Version: New」重新部署，
 *    否則 /exec 還在跑舊版程式碼。
 * 8. 前端第一次連線請先呼叫 action = "init"（每個 action 也會自動惰性 init，冪等）。
 *
 * ---------------------------------------------------------------------------
 * 二、傳輸協定（前端 contract）
 * ---------------------------------------------------------------------------
 * POST  https://script.google.com/macros/s/XXX/exec
 *       Content-Type: text/plain;charset=utf-8
 *       body = {"v":1,"action":"<name>","payload":{...}}   （字串化的 JSON）
 * Apps Script 從 e.postBody.contents 讀取；若 POST body 在 302 轉址後遺失，
 * 可用 GET ?p=<encodeURIComponent(JSON)>，doGet 會以完全相同的方式路由。
 * 回應一律是 JSON：{"ok":true,...} 或 {"ok":false,"error":"<CODE>","message":"..."}。
 * 不會拋例外、不自訂 CORS header、不要求自訂 request header。
 *
 * ---------------------------------------------------------------------------
 * 三、各 action 會寫到哪個 Drive 位置
 * ---------------------------------------------------------------------------
 * USERS_FOLDER_ID                 帳號檔 <username>.txt
 *   寫入：init（建立管理员檔）、register（新檔）、login（升級舊明文檔）、
 *         setFavorite（改 favorite）、verify（不寫）
 * COMMENTS_FOLDER_ID/_xiuxian_data/   posts.json / votes.json / sessions.json
 *   寫入：createPost、deletePost、toggleLike、addComment、deleteComment、
 *         setFavorite、logout、login（session）
 * COMMENTS_FOLDER_ID              留言媒體檔 comment_<id8>_<n>_<name> 與 _comments_log.txt
 *   寫入：addComment
 * VIDEOS_FOLDER_ID                createPost 的 base64 上傳會存到這裡
 * SUGGESTIONS_FOLDER_ID           <username>.txt（建議記錄，append）
 *   寫入：submitSuggestion
 * CHARACTER_VIDEO_FOLDER_ID       唯讀（角色影片自動比對）
 *
 * ---------------------------------------------------------------------------
 * 四、錯誤碼
 * ---------------------------------------------------------------------------
 * BAD_REQUEST / UNKNOWN_ACTION / SERVER / FOLDER_NOT_FOUND / BUSY（拿不到鎖）
 * USERNAME_INVALID / USERNAME_TAKEN / PASSWORD_WEAK / NAME_RESERVED / BAD_CREDENTIALS
 * NOT_SIGNED_IN / SESSION_EXPIRED / NOT_ADMIN / POST_NOT_FOUND / COMMENT_NOT_FOUND
 * FORBIDDEN / FILE_NOT_FOUND / MEDIA_FOLDER_NOT_ALLOWED / UPLOAD_TOO_LARGE / UPLOAD_EMPTY
 * SUGGESTION_TOO_LONG / CHARACTER_VIDEO_FOLDER_EMPTY
 * 其他實作細節見每個 handler 上方的中文註解。
 *
 * 使用服務：DriveApp、Utilities、ContentService、LockService、CacheService（僅快取）。
 * 無外部函式庫。
 ******************************************************************************/

var VERSION = '1.0.0';

/* ======================= 作者可改設定（CONFIG） ======================= */
var CONFIG = {
  DATA_SUBFOLDER: '_xiuxian_data',
  USERS_FOLDER_ID: '11134-PVlis1jrKOiK9lKLuk7CamiUFD7',
  VIDEOS_FOLDER_ID: '1tsnPO7S17lGqczndG4315q5n1jYOyAMw',
  CHARACTER_VIDEO_FOLDER_ID: '1aON0l-mkuYXpBCHJkKHFVhpjpYGlo5dF',
  COMMENTS_FOLDER_ID: '1gkygt0gJ953aPYzZQNbjtxi0UHwPYL2w',
  SUGGESTIONS_FOLDER_ID: '1zAD-xm89P1sgMTZs4ExVS3uxJMQTStDl',
  ADMIN_USERNAME: '毛奈',
  ADMIN_PASSWORD: 'Rorkey@0820',
  ADMIN_NAME_FILE: '毛奈.txt',
  SESSION_DAYS_REMEMBER: 30,
  SESSION_DAYS_SESSION: 1,
  STORE_PLAINTEXT_PASSWORD: false,   // true only if the author insists on seeing passwords
  CHARACTER_VIDEO_CACHE_MS: 600000,
  MAX_UPLOAD_BYTES: 6000000,
  POSTS_PER_PAGE: 12,
  LOG_COMMENTS_FILE: '_comments_log.txt'
};
/* ===================================================================== */

/* ---------------------------- 角色清單 ---------------------------- */
var CHARACTERS = [
  { id: 'xiao-shi-jie',         name: '小師姐',    aliases: ['小師姐', '小师姐', 'xiao-shi-jie', 'xiaoshijie', '1'] },
  { id: 'shi-zun',              name: '師尊',      aliases: ['師尊', '师尊', 'shi-zun', 'shizun', '2'] },
  { id: 'da-shi-xiong',         name: '大師兄',    aliases: ['大師兄', '大师兄', 'da-shi-xiong', 'dashixiong', '3'] },
  { id: 'er-shi-jie',           name: '二師姐',    aliases: ['二師姐', '二师姐', 'er-shi-jie', 'ershijie', '4'] },
  { id: 'san-shi-xiong',        name: '三師兄',    aliases: ['三師兄', '三师兄', 'san-shi-xiong', 'sanshixiong', '5'] },
  { id: 'xuan-yin-lao-zu',      name: '玄音老祖',  aliases: ['玄音老祖', '玄音', 'xuan-yin-lao-zu', 'xuan_yin', 'xuanyin', '6'] },
  { id: 'zuo-zhe-xiao-shi-di',  name: '作者小師弟', aliases: ['作者小師弟', '作者小师弟', 'zuo-zhe-xiao-shi-di', 'zuozhe', 'author', '7'] }
];

var CHARACTER_IDS = CHARACTERS.map(function (c) { return c.id; });

var POSTS_FILE = 'posts.json';
var VOTES_FILE = 'votes.json';
var SESSIONS_FILE = 'sessions.json';

var VIDEO_EXT = { mp4: 1, m4v: 1, mov: 1, webm: 1, mkv: 1, avi: 1, mpeg: 1, mpg: 1 };
var IMAGE_EXT = { png: 1, jpg: 1, jpeg: 1, webp: 1, bmp: 1, heic: 1 };
var POST_KINDS = { video: 1, image: 1, gif: 1 };
var COMMENT_KINDS = { text: 1, image: 1, gif: 1, video: 1 };

var CACHE_CHARS_KEY = 'xyp_char_videos_v1';
var CACHE_INIT_KEY = 'xyp_init_flag_v1';
var INIT_FLAG = '1';
var INIT_CACHE_SECONDS = 300;      // 惰性 init 每 5 分鐘才跑一次
var LOCK_MS = 20000;

/* ======================================================================
 * 進入點：doPost / doGet
 * ==================================================================== */

/** POST 進入點：body 是字串化 JSON（text/plain）。 */
function doPost(e) {
  return handleRequest_(e, 'POST');
}

/** GET 進入點：?p=<urlencoded JSON>（302 轉址後 body 遺失的備援路徑）。 */
function doGet(e) {
  return handleRequest_(e, 'GET');
}

/** 統一處理：解析 → 分派 → 一定回 JSON，不讓例外逃出。 */
function handleRequest_(e, method) {
  var result;
  try {
    var req = parseRequest_(e);
    if (!req) {
      if (method === 'POST') {
        // POST 沒有帶到 body：通常是 /exec 的 302 轉址把 body 遺失（部分客戶端/代理會發生）。
        // 這裡一定要回 ok:false，前端才會自動改用 GET ?p=<JSON> 重送同一个動作。
        result = fail_('BAD_REQUEST', 'POST 沒有帶 body（可能在 302 轉址時被遺失）。請改用 GET ?p=<encodeURIComponent(JSON)> 或 transport=auto 自動備援。');
      } else {
        // GET 且沒有帶 p：回服務資訊，方便作者確認部署是否正常。
        result = ok_(serviceInfo_());
      }
    } else {
      result = runAction_(req.action, req.payload, method);
    }
  } catch (err) {
    result = failFromError_(err);
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 防守式解析：e.postBody.contents → e.parameter.p → e.content；解析失敗 BAD_REQUEST。 */
function parseRequest_(e) {
  var raw = null;
  if (e && e.postBody && typeof e.postBody === 'object' && typeof e.postBody.contents === 'string') {
    raw = e.postBody.contents;
  } else if (e && typeof e.postBody === 'string' && e.postBody) {
    raw = e.postBody;
  } else if (e && e.parameter && typeof e.parameter.p === 'string' && e.parameter.p) {
    raw = e.parameter.p;
  } else if (e && e.parameters && Object.prototype.toString.call(e.parameters.p) === '[object Array]' && e.parameters.p.length) {
    raw = String(e.parameters.p[0]);
  } else if (e && typeof e.content === 'string' && e.content) {
    raw = e.content; // 前端若改用 application/json 也能動（不需自訂 header）
  }
  if (raw === null || String(raw).trim() === '') return null;

  var text = String(raw);
  // 有些中介層會把 p 多層編碼一次；解一次再试。
  if (text.charAt(0) !== '{') {
    try {
      var decoded = decodeURIComponent(text);
      if (decoded.charAt(0) === '{') text = decoded;
    } catch (errDecode) { /* 忽略，維持原字串 */ }
  }

  var obj;
  try {
    obj = JSON.parse(text);
  } catch (errParse) {
    throw errObj_('BAD_REQUEST', '無法解析請求 JSON：' + String(errParse));
  }
  if (!obj || typeof obj !== 'object' || typeof obj.action !== 'string' || !obj.action) {
    throw errObj_('BAD_REQUEST', '請求格式錯誤：需要 {"v":1,"action":"...","payload":{}}');
  }
  var payload = obj.payload;
  if (!payload || typeof payload !== 'object' || Object.prototype.toString.call(payload) === '[object Array]') {
    payload = {};
  }
  return { action: obj.action, payload: payload, v: obj.v };
}

/** action 分派表：每個 action 前都先惰性 init（有 5 分鐘快取旗標）。 */
function runAction_(action, payload, method) {
  ensureInit_();
  switch (action) {
    case 'init':              return actionInit_();
    case 'register':          return actionRegister_(payload);
    case 'login':             return actionLogin_(payload);
    case 'logout':            return actionLogout_(payload);
    case 'whoami':            return actionWhoami_(payload);
    case 'setFavorite':       return actionSetFavorite_(payload);
    case 'getVotes':          return actionGetVotes_();
    case 'getFeed':           return actionGetFeed_(payload);
    case 'createPost':        return actionCreatePost_(payload);
    case 'deletePost':        return actionDeletePost_(payload);
    case 'toggleLike':        return actionToggleLike_(payload);
    case 'addComment':        return actionAddComment_(payload);
    case 'deleteComment':     return actionDeleteComment_(payload);
    case 'listDriveMedia':    return actionListDriveMedia_(payload);
    case 'characterVideos':   return actionCharacterVideos_();
    case 'submitSuggestion':  return actionSubmitSuggestion_(payload);
    case 'mySuggestions':     return actionMySuggestions_(payload);
    case 'verify':            return actionVerify_(payload);
    case 'stats':             return actionStats_(payload);
    default:
      throw errObj_('UNKNOWN_ACTION', '不支援的 action：' + action + '（method=' + method + '）');
  }
}

/* ======================================================================
 * 1) init —— 確保資料夾／資料檔／管理員帳號存在（冪等）
 * ==================================================================== */

/** 惰性 init：每個 action 都會呼叫，用 CacheService 旗標省掉重複初始化。 */
function ensureInit_() {
  if (cacheGet_(CACHE_INIT_KEY) === INIT_FLAG) return;
  bootstrap_();
  cachePut_(CACHE_INIT_KEY, INIT_FLAG, INIT_CACHE_SECONDS);
}

function actionInit_() {
  var info = bootstrap_();
  cachePut_(CACHE_INIT_KEY, INIT_FLAG, INIT_CACHE_SECONDS);
  return ok_({
    version: VERSION,
    adminExists: info.adminExists,
    counts: info.counts,
    folders: {
      users: CONFIG.USERS_FOLDER_ID,
      videos: CONFIG.VIDEOS_FOLDER_ID,
      characters: CONFIG.CHARACTER_VIDEO_FOLDER_ID,
      comments: CONFIG.COMMENTS_FOLDER_ID,
      suggestions: CONFIG.SUGGESTIONS_FOLDER_ID
    }
  });
}

/** 建立所有需要的資料夾、三個 JSON 檔與管理員帳號。任何已存在的东西不動。 */
function bootstrap_() {
  // 資料夾 id 寫錯就明確報 FOLDER_NOT_FOUND，讓前端能看到原因。
  var usersFolder = requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID');
  var commentsFolder = requireFolder_(CONFIG.COMMENTS_FOLDER_ID, 'COMMENTS_FOLDER_ID');
  requireFolder_(CONFIG.SUGGESTIONS_FOLDER_ID, 'SUGGESTIONS_FOLDER_ID');
  var dataFolder = getDataFolder_();

  withLock_(function () {
    if (!getFileByFolderAndName(dataFolder, POSTS_FILE, null)) {
      writeJson_(dataFolder, POSTS_FILE, { updatedAt: nowIso_(), posts: [] });
    }
    if (!getFileByFolderAndName(dataFolder, VOTES_FILE, null)) {
      writeJson_(dataFolder, VOTES_FILE, { counts: emptyVoteCounts_(), voters: {} });
    }
    if (!getFileByFolderAndName(dataFolder, SESSIONS_FILE, null)) {
      writeJson_(dataFolder, SESSIONS_FILE, { tokens: {} });
    }
  });

  var adminExists = ensureAdminAccount_(usersFolder, commentsFolder);
  return {
    adminExists: adminExists,
    counts: {
      posts: postsDoc_().posts.length,
      users: listAccountFiles_(usersFolder).length
    }
  };
}

/** 管理員帳號檔（檔名用 CONFIG.ADMIN_NAME_FILE）；不存在就依 ADMIN_PASSWORD 建立。 */
function ensureAdminAccount_(usersFolder, commentsFolder) {
  var adminFile = CONFIG.ADMIN_NAME_FILE || (safeUserName_(CONFIG.ADMIN_USERNAME) + '.txt');
  var existing = getFileByFolderAndName(usersFolder, adminFile, null);
  if (existing) return true;
  var acc = newAccountObject_(CONFIG.ADMIN_USERNAME, 'admin', null);
  setPasswordOnAccount_(acc, CONFIG.ADMIN_PASSWORD);
  writeAccountFile_(usersFolder, adminFile, acc);
  return true;
}

/* ======================================================================
 * 2) register —— 註冊一般會員
 * ==================================================================== */
function actionRegister_(p) {
  var username = str_(p.username).trim();
  var password = (p.password === null || p.password === undefined) ? '' : String(p.password);

  if (!validateUsernameFormat_(username)) throw errObj_('USERNAME_INVALID', '帳號名稱需 2–20 字，仅可用中文/英文/數字/底線');
  if (username.toLowerCase() === String(CONFIG.ADMIN_USERNAME).toLowerCase()) {
    throw errObj_('NAME_RESERVED', '此名稱保留給管理員');
  }
  if (password.length < 6) throw errObj_('PASSWORD_WEAK', '密碼至少 6 個字元');

  var usersFolder = requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID');
  var created = withLock_(function () {
    if (readAccount_(username)) {
      throw errObj_('USERNAME_TAKEN', '帳號已存在');
    }
    var acc = newAccountObject_(username, 'member', null);
    setPasswordOnAccount_(acc, password);
    writeAccountFile_(usersFolder, accountFileName_(username), acc);
    return acc;
  });

  var sess = createSession_(created.username, false);
  return ok_({
    token: sess.token,
    expiresAt: sess.expiresAt,
    user: publicUser_(created)
  });
}

/* ======================================================================
 * 3) login —— 登入（remember 决定 session 天數）
 * ==================================================================== */
function actionLogin_(p) {
  var username = str_(p.username).trim();
  var password = (p.password === null || p.password === undefined) ? '' : String(p.password);
  if (!username || !password) throw errObj_('BAD_CREDENTIALS', '請輸入帳號與密碼');

  var usersFolder = requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID');
  var account = readAccount_(username);
  if (!account) throw errObj_('BAD_CREDENTIALS', '帳號或密碼錯誤');

  var okPass = verifyAccountPassword_(account, password, function (upgraded) {
    // 舊明文檔驗證成功後，立刻升級成 SHA-256 + salt 格式。
    writeAccountFile_(usersFolder, accountFileName_(account.username), upgraded);
  });
  if (!okPass) throw errObj_('BAD_CREDENTIALS', '帳號或密碼錯誤');

  var sess = createSession_(account.username, !!p.remember);
  return ok_({
    token: sess.token,
    expiresAt: sess.expiresAt,
    user: publicUser_(account)
  });
}

/* ======================================================================
 * 4) logout —— 注销某個 token（未知 token 也回 ok）
 * ==================================================================== */
function actionLogout_(p) {
  var token = str_(p.token);
  if (!token) return ok_({});
  withLock_(function () {
    var doc = sessionsDoc_();
    pruneSessions_(doc);
    if (doc.tokens.hasOwnProperty(token)) delete doc.tokens[token];
    writeJson_(getDataFolder_(), SESSIONS_FILE, doc);
  });
  return ok_({});
}

/* ======================================================================
 * 5) whoami —— 目前登入者
 * ==================================================================== */
function actionWhoami_(p) {
  var sess = readSession_(str_(p.token)); // 沒有 token → NOT_SIGNED_IN；失效 → SESSION_EXPIRED
  var account = readAccount_(sess.username);
  if (!account) return fail_('SESSION_EXPIRED', '帳號已不存在');
  return ok_({ user: publicUser_(account), expiresAt: sess.expiresAt });
}

/* ======================================================================
 * 6) setFavorite —— 改喜愛的角色，同步 votes.json（一人一票，改投票=移動）
 * ==================================================================== */
function actionSetFavorite_(p) {
  var auth = requireUser_(p);
  var characterId = str_(p.characterId).trim();
  if (CHARACTER_IDS.indexOf(characterId) < 0) {
    throw errObj_('BAD_REQUEST', '未知的角色 id：' + characterId);
  }

  var usersFolder = requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID');
  var votes;
  withLock_(function () {
    // 1. 帳號檔
    var account = readAccount_(auth.username);
    if (!account) throw errObj_('SESSION_EXPIRED', '帳號已不存在');
    account.favorite = characterId;
    writeAccountFile_(usersFolder, accountFileName_(account.username), account);

    // 2. votes.json
    var doc = votesDoc_();
    var voters = doc.voters || {};
    var counts = doc.counts || {};
    var prev = voters[account.username];
    if (prev && prev !== characterId) {
      // 舊票收回（一人一票）
      counts[prev] = Math.max(0, toInt_(counts[prev], 0) - 1);
    }
    if (prev !== characterId) {
      counts[characterId] = toInt_(counts[characterId], 0) + 1;
      voters[account.username] = characterId;
    }
    doc.counts = counts;
    doc.voters = voters;
    writeJson_(getDataFolder_(), VOTES_FILE, doc);
    votes = fullVotes_(doc);
  });

  return ok_({ votes: votes.counts, favorite: characterId });
}

/* ======================================================================
 * 7) getVotes —— 七個角色的票數（補 0）與總和
 * ==================================================================== */
function actionGetVotes_() {
  var full = fullVotes_(votesDoc_());
  return ok_({ votes: { counts: full.counts, total: full.total } });
}

/* ======================================================================
 * 8) getFeed —— 分頁讀取貼文（最新在前）
 * ==================================================================== */
function actionGetFeed_(p) {
  var page = toIntRange_(p.page, 1, 1, 100000);
  var pageSize = toIntRange_(p.pageSize, CONFIG.POSTS_PER_PAGE, 1, 50);
  var doc = postsDoc_();
  var posts = [];
  for (var i = 0; i < doc.posts.length; i++) posts.push(normalizePost_(doc.posts[i]));

  var start = (page - 1) * pageSize;
  var slice = posts.slice(start, start + pageSize);
  return ok_({
    posts: slice,
    page: page,
    pageSize: pageSize,
    total: posts.length,
    hasMore: (start + slice.length) < posts.length
  });
}

/* ======================================================================
 * 9) createPost —— 僅管理員：mediaFileId / mediaUrl / mediaData(base64) 三擇一
 * ==================================================================== */
function actionCreatePost_(p) {
  var auth = requireAdmin_(p);
  var kind = str_(p.kind).toLowerCase();
  if (!POST_KINDS[kind]) kind = '';

  var videosFolder = requireFolder_(CONFIG.VIDEOS_FOLDER_ID, 'VIDEOS_FOLDER_ID');
  var media = resolveMedia_(p, {
    saveFolder: videosFolder,
    allowedFolderIds: [CONFIG.VIDEOS_FOLDER_ID, CONFIG.COMMENTS_FOLDER_ID, CONFIG.CHARACTER_VIDEO_FOLDER_ID]
  });
  if (!media) throw errObj_('BAD_REQUEST', '需要 mediaFileId、mediaUrl 或 mediaData 其中一個');

  var postKind = kind || kindOf_(media.mime, media.name);
  if (!POST_KINDS[postKind]) postKind = 'video';
  if (postKind === 'gif' || kindOf_(media.mime, media.name) === 'gif') postKind = 'gif';

  var post = {
    id: newId_('p'),
    kind: postKind,
    author: auth.username,
    authorRole: auth.account.role,
    createdAt: nowIso_(),
    caption: str_(p.caption),
    media: media,
    likes: [],
    comments: []
  };

  withLock_(function () {
    var doc = postsDoc_();
    doc.posts.unshift(post);
    writeJson_(getDataFolder_(), POSTS_FILE, doc);
  });

  return ok_({ post: post });
}

/* ======================================================================
 * 10) deletePost —— 僅管理員（只從 feed 移除，不刪 Drive 檔）
 * ==================================================================== */
function actionDeletePost_(p) {
  requireAdmin_(p);
  var postId = str_(p.postId);
  if (!postId) throw errObj_('BAD_REQUEST', '缺少 postId');
  withLock_(function () {
    var doc = postsDoc_();
    var kept = [];
    var found = false;
    for (var i = 0; i < doc.posts.length; i++) {
      var one = doc.posts[i];
      if (one && str_(one.id) === postId) { found = true; continue; }
      kept.push(one);
    }
    if (!found) throw errObj_('POST_NOT_FOUND', '找不到貼文：' + postId);
    doc.posts = kept;
    writeJson_(getDataFolder_(), POSTS_FILE, doc);
  });
  return ok_({ postId: postId });
}

/* ======================================================================
 * 11) toggleLike —— 同一帳號只能有一個讚，再按一次取消
 * ==================================================================== */
function actionToggleLike_(p) {
  var auth = requireUser_(p);
  var postId = str_(p.postId);
  if (!postId) throw errObj_('BAD_REQUEST', '缺少 postId');

  var result = withLock_(function () {
    var doc = postsDoc_();
    var post = findPost_(doc, postId);
    if (!post) throw errObj_('POST_NOT_FOUND', '找不到貼文：' + postId);
    if (Object.prototype.toString.call(post.likes) !== '[object Array]') post.likes = [];
    var likes = [];
    for (var i = 0; i < post.likes.length; i++) {
      var u = post.likes[i];
      if (typeof u === 'string' && u) likes.push(u);
    }
    var idx = likes.indexOf(auth.username);
    var liked;
    if (idx >= 0) { likes.splice(idx, 1); liked = false; }
    else { likes.push(auth.username); liked = true; }
    post.likes = likes;
    writeJson_(getDataFolder_(), POSTS_FILE, doc);
    return { likeCount: likes.length, liked: liked };
  });

  return ok_({ postId: postId, likeCount: result.likeCount, liked: result.liked });
}

/* ======================================================================
 * 12) addComment —— 留言（文字或媒體），媒體存 COMMENTS_FOLDER_ID 並記 log
 * ==================================================================== */
function actionAddComment_(p) {
  var auth = requireUser_(p);
  var postId = str_(p.postId);
  if (!postId) throw errObj_('BAD_REQUEST', '缺少 postId');
  var text = (p.text === null || p.text === undefined) ? '' : String(p.text);
  var kindHint = str_(p.kind).toLowerCase();

  var commentsFolder = requireFolder_(CONFIG.COMMENTS_FOLDER_ID, 'COMMENTS_FOLDER_ID');

  var updated = withLock_(function () {
    var doc = postsDoc_();
    var post = findPost_(doc, postId);
    if (!post) throw errObj_('POST_NOT_FOUND', '找不到貼文：' + postId);
    if (Object.prototype.toString.call(post.comments) !== '[object Array]') post.comments = [];

    // 媒體檔名需要已存在的 comment 編號，所以在鎖內計算 n。
    var media = null;
    var n = nextCommentMediaIndex_(commentsFolder, postId);
    media = resolveMedia_(p, {
      saveFolder: commentsFolder,
      allowedFolderIds: [CONFIG.COMMENTS_FOLDER_ID, CONFIG.VIDEOS_FOLDER_ID, CONFIG.CHARACTER_VIDEO_FOLDER_ID],
      namePrefix: commentNamePrefix_(postId),
      nameIndex: n
    });

    // 留言 kind 以實際媒體類型為準（客戶端 kind 只是提示，不符時以媒體修正）
    var mediaKind = media ? kindOf_(media.mime, media.name) : '';
    var kind;
    if (media) {
      if (COMMENT_KINDS[mediaKind]) kind = mediaKind;
      else if (COMMENT_KINDS[kindHint] && kindHint !== 'text') kind = kindHint;
      else kind = 'image';
    } else {
      kind = 'text';
    }

    var comment = {
      id: newId_('c'),
      user: auth.username,
      kind: kind,
      text: text,
      media: media || null,
      createdAt: nowIso_()
    };
    post.comments.push(comment);
    writeJson_(getDataFolder_(), POSTS_FILE, doc);

    appendCommentLog_(commentsFolder, postId, auth.username, text, media);
    return normalizePost_(post);
  });

  return ok_({ post: updated });
}

/* ======================================================================
 * 13) deleteComment —— 管理員或留言作者本人
 * ==================================================================== */
function actionDeleteComment_(p) {
  var auth = requireUser_(p);
  var postId = str_(p.postId);
  var commentId = str_(p.commentId);
  if (!postId || !commentId) throw errObj_('BAD_REQUEST', '缺少 postId 或 commentId');

  var updated = withLock_(function () {
    var doc = postsDoc_();
    var post = findPost_(doc, postId);
    if (!post) throw errObj_('POST_NOT_FOUND', '找不到貼文：' + postId);
    if (Object.prototype.toString.call(post.comments) !== '[object Array]') post.comments = [];

    var found = null;
    var kept = [];
    for (var i = 0; i < post.comments.length; i++) {
      var c = post.comments[i];
      if (c && str_(c.id) === commentId) { found = c; continue; }
      kept.push(c);
    }
    if (!found) throw errObj_('COMMENT_NOT_FOUND', '找不到留言：' + commentId);
    if (auth.account.role !== 'admin' && str_(found.user) !== auth.username) {
      throw errObj_('FORBIDDEN', '只能刪除自己的留言');
    }
    post.comments = kept;
    writeJson_(getDataFolder_(), POSTS_FILE, doc);
    return normalizePost_(post);
  });

  return ok_({ post: updated });
}

/* ======================================================================
 * 14) listDriveMedia —— 僅管理員：列出指定資料夾的檔案
 * ==================================================================== */
function actionListDriveMedia_(p) {
  requireAdmin_(p);
  var which = str_(p.folder).toLowerCase();
  var folderId;
  if (which === 'videos' || which === '') folderId = CONFIG.VIDEOS_FOLDER_ID;
  else if (which === 'comments') folderId = CONFIG.COMMENTS_FOLDER_ID;
  else if (which === 'characters') folderId = CONFIG.CHARACTER_VIDEO_FOLDER_ID;
  else throw errObj_('BAD_REQUEST', 'folder 只能是 videos / comments / characters');

  var folder = requireFolder_(folderId, 'listDriveMedia.folder=' + which);
  var limit = toIntRange_(p.limit, 100, 1, 500);
  var q = str_(p.query).trim().toLowerCase();

  var media = [];
  var it = folder.getFiles();
  while (it.hasNext() && media.length < limit) {
    var file = it.next();
    var name = file.getName();
    if (q && name.toLowerCase().indexOf(q) < 0) continue;
    var mime = file.getMimeType() || '';
    if (mime === MimeType.GOOGLE_DOCS || mime === MimeType.FOLDER) continue;
    media.push({
      fileId: file.getId(),
      name: name,
      mime: mime,
      size: safeSize_(file),
      createdAt: isoOf_(file.getCreatedDate()),
      kind: kindOf_(mime, name)
    });
  }
  return ok_({ media: media });
}

/* ======================================================================
 * 15) characterVideos —— 角色影片自動比對（有 CacheService 快取）
 * ==================================================================== */
function actionCharacterVideos_() {
  var ttl = Math.max(60, Math.floor((toInt_(CONFIG.CHARACTER_VIDEO_CACHE_MS, 600000) / 1000)));
  var cached = cacheGet_(CACHE_CHARS_KEY);
  if (cached) {
    try {
      var hit = JSON.parse(cached);
      if (hit && hit.map && hit.matched) {
        return ok_({ map: hit.map, folderId: hit.folderId, matched: hit.matched });
      }
    } catch (errCache) { /* 快取損壞就重組 */ }
  }

  var folder = requireFolder_(CONFIG.CHARACTER_VIDEO_FOLDER_ID, 'CHARACTER_VIDEO_FOLDER_ID');
  var files = collectCharacterVideoFiles_(folder);
  var map = {};
  var matched = [];
  for (var i = 0; i < CHARACTERS.length; i++) {
    var ch = CHARACTERS[i];
    var picked = pickCharacterVideo_(ch, files);
    if (picked) {
      var entry = mediaFromFile_(picked.file);
      entry.updated = isoOf_(picked.file.getUpdatedDate());
      map[ch.id] = entry;
      matched.push(ch.id);
    }
  }
  cachePut_(CACHE_CHARS_KEY, JSON.stringify({ map: map, matched: matched, folderId: folder.getId() }), ttl);
  return ok_({ map: map, folderId: folder.getId(), matched: matched });
}

/* ======================================================================
 * 16) submitSuggestion —— 建議寫進 SUGGESTIONS_FOLDER_ID/<username>.txt
 * ==================================================================== */
function actionSubmitSuggestion_(p) {
  var auth = requireUser_(p);
  var text = (p.text === null || p.text === undefined) ? '' : String(p.text).replace(/\r\n/g, '\n').trim();
  if (!text) throw errObj_('BAD_REQUEST', '建議內容不能空白');
  if (text.length > 2000) throw errObj_('SUGGESTION_TOO_LONG', '建議內容最長 2000 字（目前 ' + text.length + '）');

  var folder = requireFolder_(CONFIG.SUGGESTIONS_FOLDER_ID, 'SUGGESTIONS_FOLDER_ID');
  var fileName = accountFileName_(auth.username);
  var block = '=== [' + nowIso_() + '] ===\n' + text + '\n\n';
  appendTextToFile_(folder, fileName, block);

  return ok_({ saved: fileName });
}

/* ======================================================================
 * 17) mySuggestions —— 讀回自己的建議（容忍手改）
 * ==================================================================== */
function actionMySuggestions_(p) {
  var auth = requireUser_(p);
  var folder = requireFolder_(CONFIG.SUGGESTIONS_FOLDER_ID, 'SUGGESTIONS_FOLDER_ID');
  var file = getFileByFolderAndName(folder, accountFileName_(auth.username), null);
  if (!file) return ok_({ entries: [] });
  var text = readFileText_(file);
  return ok_({ entries: parseSuggestionEntries_(text) });
}

/* ======================================================================
 * 18) verify —— 敏感頁面再次確認密碼
 * ==================================================================== */
function actionVerify_(p) {
  var auth = requireUser_(p);
  var password = (p.password === null || p.password === undefined) ? '' : String(p.password);
  var valid = verifyAccountPassword_(auth.account, password, function (upgraded) {
    var usersFolder = requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID');
    writeAccountFile_(usersFolder, accountFileName_(upgraded.username), upgraded);
  });
  return ok_({ valid: !!valid });
}

/* ======================================================================
 * 19) stats —— 僅管理員：全站統計
 * ==================================================================== */
function actionStats_(p) {
  requireAdmin_(p);
  var usersFolder = requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID');
  var postsDoc = postsDoc_();
  var comments = 0;
  for (var i = 0; i < postsDoc.posts.length; i++) {
    var one = postsDoc.posts[i] || {};
    if (Object.prototype.toString.call(one.comments) === '[object Array]') comments += one.comments.length;
  }
  var full = fullVotes_(votesDoc_());
  return ok_({
    users: listAccountFiles_(usersFolder).length,
    posts: postsDoc.posts.length,
    comments: comments,
    votes: { counts: full.counts, total: full.total },
    lastPostAt: (postsDoc.posts.length && postsDoc.posts[0] && postsDoc.posts[0].createdAt) ? postsDoc.posts[0].createdAt : null
  });
}

/* ======================================================================
 * 認證 / 授權
 * ==================================================================== */

/** 需要有效 token；沒有 → NOT_SIGNED_IN，失效/不存在 → SESSION_EXPIRED。 */
function requireUser_(p) {
  var sess = readSession_(str_(p.token));
  var account = readAccount_(sess.username);
  if (!account) throw errObj_('SESSION_EXPIRED', '帳號已不存在');
  return { username: account.username, account: account, session: sess };
}

/** 需要管理員 token，否則 NOT_ADMIN。 */
function requireAdmin_(p) {
  var auth = requireUser_(p);
  if (auth.account.role !== 'admin') throw errObj_('NOT_ADMIN', '此動作只開放管理員');
  return auth;
}

/** 讀 session（唯讀，不改檔案；過期清理在寫入時做）。 */
function readSession_(token) {
  if (!token) throw errObj_('NOT_SIGNED_IN', '尚未登入');
  var doc = sessionsDoc_();
  var entry = doc.tokens ? doc.tokens[token] : null;
  if (!entry || typeof entry !== 'object' || !entry.username) throw errObj_('SESSION_EXPIRED', '登入已失效，請重新登入');
  var expiresAt = str_(entry.expiresAtISO);
  var expMs = Date.parse(expiresAt);
  if (!expiresAt || isNaN(expMs) || expMs <= Date.now()) {
    throw errObj_('SESSION_EXPIRED', '登入已過期，請重新登入');
  }
  return { token: token, username: String(entry.username), expiresAt: expiresAt };
}

/** 產生新 token；每次寫入都會清掉過期 token。 */
function createSession_(username, remember) {
  var days = remember ? toInt_(CONFIG.SESSION_DAYS_REMEMBER, 30) : toInt_(CONFIG.SESSION_DAYS_SESSION, 1);
  if (days < 1) days = 1;
  var token = Utilities.getUuid().replace(/-/g, '');
  var expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  withLock_(function () {
    var doc = sessionsDoc_();
    pruneSessions_(doc);
    doc.tokens[token] = { username: username, expiresAtISO: expiresAt };
    writeJson_(getDataFolder_(), SESSIONS_FILE, doc);
  });
  return { token: token, expiresAt: expiresAt };
}

function sessionsDoc_() {
  var doc = readJson_(getDataFolder_(), SESSIONS_FILE, { tokens: {} });
  if (!doc || typeof doc !== 'object') doc = { tokens: {} };
  if (!doc.tokens || typeof doc.tokens !== 'object' || Object.prototype.toString.call(doc.tokens) === '[object Array]') {
    doc.tokens = {};
  }
  return doc;
}

/** 清掉過期 token（每次寫入 sessions.json 前呼叫）。 */
function pruneSessions_(doc) {
  var now = Date.now();
  var removed = 0;
  for (var token in doc.tokens) {
    if (!doc.tokens.hasOwnProperty(token)) continue;
    var entry = doc.tokens[token];
    var ms = entry && entry.expiresAtISO ? Date.parse(String(entry.expiresAtISO)) : 0;
    if (!entry || !entry.username || isNaN(ms) || ms <= now) {
      delete doc.tokens[token];
      removed++;
    }
  }
  return removed;
}

/* ======================================================================
 * 帳號檔（USERS_FOLDER_ID/<username>.txt）
 * ==================================================================== */

function accountFileName_(username) {
  return safeUserName_(username) + '.txt';
}

/** 管理員名稱的對應檔名（ ADMIN_NAME_FILE 優先 ）。 */
function adminFileName_() {
  return CONFIG.ADMIN_NAME_FILE || (safeUserName_(CONFIG.ADMIN_USERNAME) + '.txt');
}

/** 讀帳號：先 <username>.txt；若是管理員名稱再試 ADMIN_NAME_FILE；最後大小寫不分掃目錄。找不到回 null。 */
function readAccount_(username) {
  var usersFolder = requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID');
  var file = findAccountFile_(usersFolder, username);
  if (!file) return null;
  return parseAccountFile_(readFileText_(file), username);
}

/**
 * 找帳號檔（create-or-get 的「get」版本）。
 * Drive 的名稱比對不一定大小寫不分，所以同名找不到時掃一次目錄，
 * 確保「帳號名稱大小寫不同視為同一人」的規則不會漏（註冊查重也靠它）。
 */
function findAccountFile_(usersFolder, username) {
  var wanted = String(username === null || username === undefined ? '' : username).toLowerCase();
  if (!wanted) return null;

  var names = [accountFileName_(username)];
  if (wanted === String(CONFIG.ADMIN_USERNAME).toLowerCase()) names.push(adminFileName_());

  var i;
  for (i = 0; i < names.length; i++) {
    var exact = getFileByFolderAndName(usersFolder, names[i], null);
    if (exact) return exact;
  }
  var files = listAccountFiles_(usersFolder);
  for (i = 0; i < files.length; i++) {
    var base = String(files[i].getName() || '').replace(/\.txt$/i, '').toLowerCase();
    if (base === wanted) return files[i];
  }
  return null;
}

/** 解析帳號檔（key: value 行），同時相容舊的 password: <明文>。 */
function parseAccountFile_(text, fallbackUsername) {
  if (text === null) return null;
  var map = {};
  var lines = String(text).split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;
    var t = line.replace(/^\uFEFF/, '');
    if (t.charAt(0) === '#') continue;
    var idx = t.indexOf(':');
    if (idx < 0) continue;
    var key = t.slice(0, idx).trim().toLowerCase();
    var val = t.slice(idx + 1).trim();
    if (key) map[key] = val;
  }
  var username = map.username && map.username ? map.username : (fallbackUsername || '');
  if (!username) return null;
  var legacyPlain = '';
  if (!map.password_sha256) {
    if (map.password) legacyPlain = map.password;
    else if (map.password_plain) legacyPlain = map.password_plain;
  }
  return {
    username: username,
    role: (String(map.role || '').toLowerCase() === 'admin') ? 'admin' : 'member',
    created: map.created || '',
    favorite: (map.favorite && map.favorite !== '-') ? map.favorite : null,
    salt: map.salt || '',
    sha256: map.password_sha256 || '',
    plainStored: map.password_plain || '',
    legacyPlain: legacyPlain,          // 只有舊檔（沒雜湊）時有值
    note: map.note || ''
  };
}

function newAccountObject_(username, role, favorite) {
  return {
    username: username,
    role: role === 'admin' ? 'admin' : 'member',
    created: nowIso_(),
    favorite: favorite || null,
    salt: '',
    sha256: '',
    plainStored: '',
    legacyPlain: '',
    note: ''
  };
}

/** 依 CONFIG.STORE_PLAINTEXT_PASSWORD 決定要不要留明文。 */
function setPasswordOnAccount_(account, password) {
  account.salt = makeSaltHex16_();
  account.sha256 = sha256Hex_(account.salt + ':' + String(password));
  account.plainStored = CONFIG.STORE_PLAINTEXT_PASSWORD ? String(password) : '';
  account.legacyPlain = '';
  return account;
}

/**
 * 驗證密碼。
 *  - 舊/手寫檔只有 password: 或 password_plain: → 明文比對，成功就升級成雜湊格式並回呼 onUpgrade。
 *  - 正常檔比對 SHA-256(salt + ':' + password)。
 */
function verifyAccountPassword_(account, password, onUpgrade) {
  if (!account) return false;
  password = (password === null || password === undefined) ? '' : String(password);

  if (!account.sha256 && account.legacyPlain) {
    if (sameText_(account.legacyPlain, password)) {
      var upgraded = copyAccount_(account);
      setPasswordOnAccount_(upgraded, password);
      if (typeof onUpgrade === 'function') onUpgrade(upgraded);
      return true;
    }
    return false;
  }
  // 有存明文時也先比明文，方便作者手動改檔後仍能登入
  if (account.plainStored && sameText_(account.plainStored, password)) return true;
  if (!account.salt || !account.sha256) return false;
  return sameHex_(sha256Hex_(account.salt + ':' + password), account.sha256);
}

function copyAccount_(acc) {
  return {
    username: acc.username, role: acc.role, created: acc.created, favorite: acc.favorite,
    salt: acc.salt, sha256: acc.sha256, plainStored: acc.plainStored, legacyPlain: acc.legacyPlain, note: acc.note
  };
}

/** 依契約的固定格式寫出帳號檔（作者可手改）。 */
function writeAccountFile_(usersFolder, fileName, account) {
  var note = '密碼以 SHA-256 + salt 雜湊儲存（可在 CONFIG.STORE_PLAINTEXT_PASSWORD 改為 true 以明文記錄）';
  var lines = [];
  lines.push('# xiuxian-yaopai account');
  lines.push('username: ' + account.username);
  lines.push('role: ' + (account.role === 'admin' ? 'admin' : 'member'));
  lines.push('created: ' + (account.created || nowIso_()));
  lines.push('favorite: ' + (account.favorite ? account.favorite : '-'));
  lines.push('salt: ' + (account.salt || ''));
  lines.push('password_sha256: ' + (account.sha256 || ''));
  if (account.plainStored) lines.push('password_plain: ' + account.plainStored);
  lines.push('note: ' + note);
  var content = lines.join('\n') + '\n';

  var file = getFileByFolderAndName(usersFolder, fileName, null);
  if (file) file.setContent(content);
  else usersFolder.createFile(fileName, content, 'text/plain');
  return file;
}

/** 列出帳號檔（排除底線開頭的系统檔）。 */
function listAccountFiles_(usersFolder) {
  var out = [];
  var it = usersFolder.getFilesByType('text/plain');
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (!n || n.charAt(0) === '.' || n.charAt(0) === '_') continue;
    if (n.toLowerCase().indexOf('.txt') < 0) continue;
    out.push(f);
  }
  return out;
}

/** 前端要的使用者欄位（不含密碼）。 */
function publicUser_(account) {
  return {
    username: account.username,
    role: account.role === 'admin' ? 'admin' : 'member',
    favorite: account.favorite || null
  };
}

/* ======================================================================
 * 使用者輸入驗證
 * ==================================================================== */

/** 帳號：2–20 個 unicode 字，只允許字母/數字/底線；不得有空白、標點、emoji、控制字元。 */
function validateUsernameFormat_(username) {
  if (typeof username !== 'string') return false;
  if (username !== username.trim()) return false;                 // 前後空白
  if (/[\u0000-\u001F\u007F-\u009F]/.test(username)) return false; // 控制字元
  if (username.indexOf('.') >= 0) return false;                    // 避免與 .txt 檔名糾纏
  var re = /^[\p{L}\p{N}_]{2,20}$/u;
  return re.test(username);
}

/** 檔名安全化：拿掉 Windows/Drive 非法字元與控制字元；中文保持原樣（不 transliterate）。 */
function safeUserName_(name) {
  var s = String(name === null || name === undefined ? '' : name);
  s = s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  s = s.replace(/[\\\/:\*\?"<>\|]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\.+$/, '');
  if (!s) s = 'unnamed';
  return s;
}

/** Drive 檔名安全化（保留 CJK 與大部分字元）。 */
function sanitizeFileName_(name) {
  var s = String(name === null || name === undefined ? '' : name);
  s = s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  s = s.replace(/[\\\/:\*\?"<>\|]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (!s) s = 'file';
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

/** 僅用於 log：把 | 與換行拿掉，維持一行一條。 */
function oneLine_(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\|/g, '/');
}

/* ======================================================================
 * 密碼雜湊 / 常數時間比對
 * ==================================================================== */

function sha256Hex_(text) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    text,
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var b = digest[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length < 2) h = '0' + h;
    hex += h;
  }
  return hex;
}

/** 16 個十六進位字元的 salt。 */
function makeSaltHex16_() {
  var seed = Utilities.getUuid() + '|' + String(Date.now()) + '|' + String(Math.random());
  return sha256Hex_(seed).slice(0, 16);
}

function sameHex_(a, b) {
  var x = String(a || '').toLowerCase();
  var y = String(b || '').toLowerCase();
  if (x.length !== y.length) return false;
  var diff = 0;
  for (var i = 0; i < x.length; i++) {
    diff |= (x.charCodeAt(i) ^ y.charCodeAt(i));
  }
  return diff === 0;
}

/** 明文比對（長度相同才逐字元 xor，減少 time-attack）。 */
function sameText_(a, b) {
  var x = String(a);
  var y = String(b);
  if (x.length !== y.length) return false;
  var diff = 0;
  for (var i = 0; i < x.length; i++) {
    diff |= (x.charCodeAt(i) ^ y.charCodeAt(i));
  }
  return diff === 0;
}

/* ======================================================================
 * Drive：資料夾 / 檔案 helpers
 * ==================================================================== */

/** id 寫錯時回 null（不拋例外）；呼叫方自己決定錯誤訊息。 */
function getFolderByIdSafe(id) {
  if (!id || typeof id !== 'string') return null;
  try {
    return DriveApp.getFolderById(id);
  } catch (err) {
    return null;
  }
}

/** 需要資料夾但拿不到 → FOLDER_NOT_FOUND，訊息寫明是哪個設定。 */
function requireFolder_(id, label) {
  var folder = getFolderByIdSafe(id);
  if (!folder) {
    throw errObj_('FOLDER_NOT_FOUND', '找不到 Drive 資料夾（' + (label || 'id') + '=' + id + '），請檢查 CONFIG');
  }
  return folder;
}

function getUsersFolder_() { return requireFolder_(CONFIG.USERS_FOLDER_ID, 'USERS_FOLDER_ID'); }
function getCommentsFolder_() { return requireFolder_(CONFIG.COMMENTS_FOLDER_ID, 'COMMENTS_FOLDER_ID'); }
function getVideosFolder_() { return requireFolder_(CONFIG.VIDEOS_FOLDER_ID, 'VIDEOS_FOLDER_ID'); }
function getCharactersFolder_() { return requireFolder_(CONFIG.CHARACTER_VIDEO_FOLDER_ID, 'CHARACTER_VIDEO_FOLDER_ID'); }
function getSuggestionsFolder_() { return requireFolder_(CONFIG.SUGGESTIONS_FOLDER_ID, 'SUGGESTIONS_FOLDER_ID'); }

/** posts.json / votes.json / sessions.json 所在資料夾（建立失敗就退回 comments 根目錄）。 */
function getDataFolder_() {
  var parent = getCommentsFolder_();
  var it = parent.getFoldersByName(CONFIG.DATA_SUBFOLDER);
  if (it.hasNext()) return it.next();
  try {
    return parent.createFolder(CONFIG.DATA_SUBFOLDER);
  } catch (err) {
    return parent;
  }
}

/** 同一個檔名取檔案；createContent 有值才建立（create-or-get 語意）。 */
function getFileByFolderAndName(folder, name, createContent) {
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    var found = it.next();
    while (it.hasNext()) it.next(); // 同名重複檔：只用第一個，其餘忽略（不刪，避免誤刪）
    return found;
  }
  if (createContent === null || createContent === undefined) return null;
  return folder.createFile(name, createContent, 'text/plain');
}

/** 讀純文字（Google Doc 走 getAs；一般文字檔走 getContents）。 */
function readFileText_(file) {
  if (!file) return null;
  var mime = '';
  try { mime = file.getMimeType() || ''; } catch (err) { mime = ''; }
  try {
    if (mime === MimeType.GOOGLE_DOCS) return file.getAs('text/plain').getContents();
    return file.getContents();
  } catch (err1) {
    try { return file.getBlob().getDataAsString('UTF-8'); } catch (err2) { return null; }
  }
}

/** 讀 JSON 檔；損壞/不存在就用 fallback（避免半毀狀態卡死全站）。 */
function readJson_(folder, name, fallback) {
  var file = getFileByFolderAndName(folder, name, null);
  if (!file) return copyJson_(fallback);
  var text = readFileText_(file);
  if (text === null) return copyJson_(fallback);
  text = String(text).replace(/^\uFEFF/, '').trim();
  if (!text) return copyJson_(fallback);
  try {
    var obj = JSON.parse(text);
    if (obj && typeof obj === 'object') return obj;
  } catch (err) { /* 損壞：退回預設 */ }
  return copyJson_(fallback);
}

function writeJson_(folder, name, obj) {
  var text = JSON.stringify(obj, null, 2);
  var file = getFileByFolderAndName(folder, name, null);
  if (file) {
    file.setContent(text);
    return file;
  }
  return folder.createFile(name, text, 'text/plain');
}

function copyJson_(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch (err) { return obj; }
}

/** 附文字到文字檔（沒有就建立）。建議檔與 log 都用它。 */
function appendTextToFile_(folder, fileName, block) {
  var file = getFileByFolderAndName(folder, fileName, null);
  if (!file) {
    folder.createFile(fileName, block, 'text/plain');
    return;
  }
  try {
    file.appendText(block);
    return;
  } catch (errAppend) {
    var old = readFileText_(file) || '';
    file.setContent(old + block);
  }
}

/** 所有 read-modify-write 都要包在這裡面；20 秒拿不到鎖就回 BUSY。 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(LOCK_MS);
  } catch (errLock) {
    got = false;
  }
  if (!got) throw errObj_('BUSY', '系統忙碌（寫入鎖等待逾時），請稍後再試');
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (errRelease) { /* ignore */ }
  }
}

/* ======================================================================
 * posts.json / votes.json
 * ==================================================================== */

function postsDoc_() {
  var doc = readJson_(getDataFolder_(), POSTS_FILE, { updatedAt: null, posts: [] });
  if (!doc || typeof doc !== 'object') doc = {};
  if (Object.prototype.toString.call(doc.posts) !== '[object Array]') doc.posts = [];
  return doc;
}

function findPost_(doc, postId) {
  for (var i = 0; i < doc.posts.length; i++) {
    if (doc.posts[i] && str_(doc.posts[i].id) === postId) return doc.posts[i];
  }
  return null;
}

/** 回傳前修補欄位，讓前端永遠拿到契約上的 key（容忍 posts.json 被手改）。 */
function normalizePost_(post) {
  var p = post && typeof post === 'object' ? post : {};
  var kind = POST_KINDS[String(p.kind || '').toLowerCase()] ? String(p.kind).toLowerCase() : 'video';
  var media = (p.media && typeof p.media === 'object' && Object.prototype.toString.call(p.media) !== '[object Array]')
    ? {
        fileId: str_(p.media.fileId),
        url: str_(p.media.url),
        name: str_(p.media.name),
        mime: str_(p.media.mime),
        directUrl: str_(p.media.directUrl) || directUrlFor_(str_(p.media.fileId))
      }
    : null;
  if (media && media.directUrl && media.fileId && media.directUrl.indexOf('export=download') < 0) {
    media.directUrl = directUrlFor_(media.fileId);
  }
  var commentsIn = Object.prototype.toString.call(p.comments) === '[object Array]' ? p.comments : [];
  var comments = [];
  for (var i = 0; i < commentsIn.length; i++) {
    var c = commentsIn[i];
    if (!c || typeof c !== 'object') continue;
    var ck = String(c.kind || '').toLowerCase();
    if (!COMMENT_KINDS[ck]) ck = c.media ? 'image' : 'text';
    var cm = (c.media && typeof c.media === 'object' && Object.prototype.toString.call(c.media) !== '[object Array]')
      ? {
          fileId: str_(c.media.fileId),
          url: str_(c.media.url),
          name: str_(c.media.name),
          mime: str_(c.media.mime),
          directUrl: str_(c.media.directUrl) || directUrlFor_(str_(c.media.fileId))
        }
      : null;
    comments.push({
      id: str_(c.id) || newId_('c'),
      user: str_(c.user),
      kind: ck,
      text: str_(c.text),
      media: cm,
      createdAt: str_(c.createdAt)
    });
  }
  var likesIn = Object.prototype.toString.call(p.likes) === '[object Array]' ? p.likes : [];
  var likes = [];
  for (var j = 0; j < likesIn.length; j++) {
    if (typeof likesIn[j] === 'string' && likesIn[j]) likes.push(likesIn[j]);
  }
  return {
    id: str_(p.id) || newId_('p'),
    kind: kind,
    author: str_(p.author),
    authorRole: str_(p.authorRole) || 'member',
    createdAt: str_(p.createdAt) || nowIso_(),
    caption: str_(p.caption),
    media: media,
    likes: likes,
    comments: comments
  };
}

function votesDoc_() {
  var doc = readJson_(getDataFolder_(), VOTES_FILE, { counts: {}, voters: {} });
  if (!doc || typeof doc !== 'object') doc = {};
  if (!doc.counts || typeof doc.counts !== 'object' || Object.prototype.toString.call(doc.counts) === '[object Array]') {
    doc.counts = {};
  }
  if (!doc.voters || typeof doc.voters !== 'object' || Object.prototype.toString.call(doc.voters) === '[object Array]') {
    doc.voters = {};
  }
  return doc;
}

function emptyVoteCounts_() {
  var counts = {};
  for (var i = 0; i < CHARACTER_IDS.length; i++) counts[CHARACTER_IDS[i]] = 0;
  return counts;
}

/** 補齊七個角色（缺的補 0）並算 total。 */
function fullVotes_(doc) {
  var src = (doc && doc.counts) || {};
  var counts = {};
  var total = 0;
  for (var i = 0; i < CHARACTER_IDS.length; i++) {
    var id = CHARACTER_IDS[i];
    var n = toInt_(src[id], 0);
    counts[id] = n;
    total += n;
  }
  return { counts: counts, total: total };
}

/* ======================================================================
 * 媒體解析（fileId / URL / base64 data URL）
 * ==================================================================== */

/**
 * opts = {
 *   saveFolder: DriveApp.Folder（base64 上傳要存進去的地方）,
 *   allowedFolderIds: [id,...]（mediaFileId 必須住在這些資料夾）,
 *   namePrefix + nameIndex: 留言媒體檔名前綴與編號（可選）
 * }
 * 回傳 media 物件或 null。
 */
function resolveMedia_(p, opts) {
  opts = opts || {};

  var fileId = str_(p.mediaFileId);
  if (fileId) {
    var file = null;
    try { file = DriveApp.getFileById(fileId); } catch (err) { file = null; }
    if (!file) throw errObj_('FILE_NOT_FOUND', '找不到檔案：' + fileId);
    if (Object.prototype.toString.call(opts.allowedFolderIds) === '[object Array]' && opts.allowedFolderIds.length) {
      if (!fileInFolders_(file, opts.allowedFolderIds)) {
        throw errObj_('MEDIA_FOLDER_NOT_ALLOWED', '檔案不在允許的資料夾：' + fileId);
      }
    }
    return mediaFromFile_(file);
  }

  var data = p.mediaData;
  if (typeof data === 'string' && data.replace(/\s/g, '').length) {
    if (!opts.saveFolder) throw errObj_('BAD_REQUEST', '此動作不接受 mediaData');
    return mediaFromDataUrl_(data, str_(p.mediaName), opts);
  }

  var url = str_(p.mediaUrl).trim();
  if (url) {
    var driveId = extractDriveId_(url);
    if (driveId) {
      var driveFile = null;
      try { driveFile = DriveApp.getFileById(driveId); } catch (errD) { driveFile = null; }
      if (driveFile) return mediaFromFile_(driveFile);
    }
    return mediaFromUrl_(url, str_(p.mediaName));
  }
  return null;
}

function mediaFromFile_(file) {
  var id = file.getId();
  var name = file.getName();
  return {
    fileId: id,
    url: 'https://drive.google.com/file/d/' + id + '/view',
    name: name,
    mime: file.getMimeType() || '',
    directUrl: directUrlFor_(id)
  };
}

/** 外部 URL（非 Drive）：只留 url，前端自己顯示。 */
function mediaFromUrl_(url, givenName) {
  var name = sanitizeFileName_(givenName || fileNameFromUrl_(url));
  return {
    fileId: '',
    url: url,
    name: name,
    mime: mimeFromExt_(extOf_(name)),
    directUrl: url
  };
}

/** data:<mime>;base64,<...> → 存檔到 saveFolder，回 media。 */
function mediaFromDataUrl_(dataUrl, givenName, opts) {
  var m = /^data:([^;,]*)(;[^,]*)?,([\s\S]*)$/.exec(String(dataUrl));
  if (!m) throw errObj_('BAD_REQUEST', 'mediaData 必須是 data:<mime>;base64,<...> 格式');
  var mime = (m[1] || '').trim().toLowerCase();
  var mods = m[2] || '';
  var body = (m[3] || '').replace(/\s/g, '');
  if (mods.indexOf('base64') < 0) throw errObj_('BAD_REQUEST', 'mediaData 需要 base64 編碼');

  // url-safe base64 也收
  var std = body.replace(/-/g, '+').replace(/_/g, '/');
  while (std.length % 4 !== 0) std += '=';

  var bytes;
  try {
    bytes = Utilities.base64Decode(std, Utilities.Base64Dialect.STANDARD);
  } catch (errDecode) {
    throw errObj_('BAD_REQUEST', 'mediaData base64 解碼失敗：' + String(errDecode));
  }
  if (!bytes || !bytes.length) throw errObj_('UPLOAD_EMPTY', '上傳內容是空檔');
  var maxBytes = toInt_(CONFIG.MAX_UPLOAD_BYTES, 6000000);
  if (bytes.length > maxBytes) {
    throw errObj_('UPLOAD_TOO_LARGE', '檔案超過上限 ' + maxBytes + ' bytes（目前 ' + bytes.length + '）');
  }

  var ext = mimeToExt_(mime) || extOf_(givenName) || extOf_(opts.preferredName) || 'bin';
  var base = sanitizeFileName_(givenName || opts.defaultName || 'upload');
  if (extOf_(base) !== ext) base = base.replace(/\.[^.]*$/, '') + '.' + ext;

  var prefix = opts.namePrefix || '';
  var candidate = prefix ? (prefix + toInt_(opts.nameIndex, 1) + '_' + base) : base;
  var unique = uniqueName_(opts.saveFolder, candidate);

  var blob = Utilities.newBlob(bytes, mime || 'application/octet-stream', unique);
  var saved = opts.saveFolder.createFile(unique, blob);
  return mediaFromFile_(saved);
}

function directUrlFor_(fileId) {
  if (!fileId) return '';
  return 'https://drive.google.com/uc?export=download&id=' + fileId;
}

/** 檔案是否住在指定資料夾（含子資料夾）之一。 */
function fileInFolders_(file, folderIds) {
  var parents;
  try { parents = file.getParents(); } catch (err) { parents = null; }
  if (!parents) return false;
  while (parents.hasNext()) {
    var parent = parents.next();
    try {
      if (folderIds.indexOf(parent.getId()) >= 0) return true;
      if (isDescendantOf_(parent, folderIds, 0)) return true;
    } catch (errP) { /* 單一 parent 讀錯就跳過 */ }
  }
  return false;
}

function isDescendantOf_(folder, folderIds, depth) {
  if (depth > 4) return false;
  var it;
  try { it = folder.getParents(); } catch (err) { return false; }
  while (it && it.hasNext()) {
    var up = it.next();
    try {
      if (folderIds.indexOf(up.getId()) >= 0) return true;
      if (isDescendantOf_(up, folderIds, depth + 1)) return true;
    } catch (errU) { /* ignore */ }
  }
  return false;
}

/** 從 Drive 網址抓檔案 id。 */
function extractDriveId_(url) {
  var u = String(url || '');
  var m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(u);
  if (m) return m[1];
  m = /[?&]id=([A-Za-z0-9_-]{10,})/.exec(u);
  if (m) return m[1];
  m = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(u);
  if (m) return m[1];
  m = /^[A-Za-z0-9_-]{28,}$/ .exec(u.trim());
  if (m) return m[1];
  return '';
}

function fileNameFromUrl_(url) {
  var u = String(url || '').split('?')[0].split('#')[0];
  var parts = u.split('/');
  var last = parts[parts.length - 1] || '';
  try { last = decodeURIComponent(last); } catch (err) { /* ignore */ }
  return last || 'external-media';
}

function extOf_(name) {
  var n = String(name || '');
  var m = /\.([A-Za-z0-9]+)$/.exec(n);
  return m ? m[1].toLowerCase() : '';
}

function mimeFromExt_(ext) {
  var table = {
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo', gif: 'image/gif', png: 'image/png',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp'
  };
  return table[ext] || '';
}

function mimeToExt_(mime) {
  var m = String(mime || '').toLowerCase();
  var table = {
    'video/mp4': 'mp4', 'video/x-m4v': 'm4v', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi', 'image/gif': 'gif', 'image/png': 'png',
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/bmp': 'bmp'
  };
  if (table[m]) return table[m];
  var slash = m.indexOf('/');
  if (slash > 0) {
    var sub = m.slice(slash + 1).replace(/[^A-Za-z0-9]/g, '');
    if (sub === 'jpeg') sub = 'jpg';
    if (sub) return sub.slice(0, 5);
  }
  return '';
}

/** 依 mime/副檔名判斷 video / image / gif / other。 */
function kindOf_(mime, name) {
  var m = String(mime || '').toLowerCase();
  var ext = extOf_(name);
  if (m === 'image/gif' || ext === 'gif') return 'gif';
  if (m.indexOf('video/') === 0 || VIDEO_EXT[ext]) return 'video';
  if (m.indexOf('image/') === 0 || IMAGE_EXT[ext]) return 'image';
  if (m === MimeType.GOOGLE_VIDEO) return 'video';
  if (m === MimeType.GOOGLE_PHOTOS || m === 'image/png') return 'image';
  return 'other';
}

function uniqueName_(folder, wanted) {
  var name = String(wanted || 'file');
  if (!getFileByFolderAndName(folder, name, null)) return name;
  var ext = extOf_(name);
  var stem = ext ? name.slice(0, name.length - ext.length - 1) : name;
  for (var i = 2; i < 500; i++) {
    var candidate = ext ? (stem + '-' + i + '.' + ext) : (stem + '-' + i);
    if (!getFileByFolderAndName(folder, candidate, null)) return candidate;
  }
  return stem + '-' + Date.now() + (ext ? '.' + ext : '');
}

function safeSize_(file) {
  try { return file.getSize(); } catch (err) { return 0; }
}

/* ======================================================================
 * 留言媒體檔名與 log
 * ==================================================================== */

function commentNamePrefix_(postId) {
  var id = String(postId || '').replace(/^p_/, '');
  return 'comment_' + id.slice(0, 8) + '_';
}

/** 下一個編號：掃 COMMENTS_FOLDER_ID 找同前綴的最大編號 + 1。 */
function nextCommentMediaIndex_(commentsFolder, postId) {
  var prefix = commentNamePrefix_(postId);
  var max = 0;
  var it = commentsFolder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var n = f.getName();
    if (!n || n.indexOf(prefix) !== 0) continue;
    var rest = n.slice(prefix.length);
    var m = /^(\d+)/.exec(rest);
    if (m) {
      var v = parseInt(m[1], 10);
      if (v > max) max = v;
    }
  }
  return max + 1;
}

/** 每一條留言 append 一行到 _comments_log.txt。 */
function appendCommentLog_(commentsFolder, postId, username, text, media) {
  var mediaTag = '';
  if (media) mediaTag = media.name || media.fileId || media.url || '';
  var line = '[' + nowIso_() + '] ' + oneLine_(postId) + ' | ' + oneLine_(username) + ' | ' +
    oneLine_(text) + ' | media=' + oneLine_(mediaTag) + '\n';
  try {
    appendTextToFile_(commentsFolder, CONFIG.LOG_COMMENTS_FILE, line);
  } catch (err) {
    // log 失敗不能讓留言失敗（留言與 posts.json 已寫好）
  }
}

/* ======================================================================
 * 建議檔解析（容忍手改）
 * ==================================================================== */

function parseSuggestionEntries_(text) {
  var entries = [];
  if (!text) return entries;
  var content = String(text).replace(/^\uFEFF/, '');
  var re = /^===[ \t]*\[([^\]]*)\][ \t]*===[ \t]*$/gm;
  var match;
  var marks = [];
  while ((match = re.exec(content)) !== null) {
    marks.push({ index: match.index, end: re.lastIndex, createdAt: (match[1] || '').trim() });
  }
  if (!marks.length) {
    // 完全不是我們的格式：整個當成一筆，方便作者手寫
    var whole = content.trim();
    if (whole) entries.push({ createdAt: '', text: whole });
    return entries;
  }
  var head = content.slice(0, marks[0].index).trim();
  if (head) entries.push({ createdAt: '', text: head });
  for (var i = 0; i < marks.length; i++) {
    var from = marks[i].end;
    var to = (i + 1 < marks.length) ? marks[i + 1].index : content.length;
    var body = content.slice(from, to).replace(/^\s*\n/, '').replace(/\s+$/, '');
    entries.push({ createdAt: marks[i].createdAt, text: body });
  }
  return entries;
}

/* ======================================================================
 * 角色影片比對（CHARACTER_VIDEO_FOLDER_ID，唯讀）
 * ==================================================================== */

/** 正規化比對 key：去副檔名 → trim → 小寫 → 空白/_/- 全部變單一連字號。 */
function normToken_(s) {
  var t = String(s === null || s === undefined ? '' : s);
  t = t.replace(/\.[A-Za-z0-9]{1,5}$/, '');      // 去副檔名（只在 key 上做一次）
  t = t.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
  t = t.replace(/[\s_\u3000\-+]+/g, '-');
  t = t.replace(/^-+|-+$/g, '');
  return t.toLowerCase();
}

function collectCharacterVideoFiles_(folder) {
  var out = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var name = f.getName();
    var mime = f.getMimeType() || '';
    var ext = extOf_(name);
    var isVideoMime = mime.indexOf('video/') === 0;
    var allowedExt = (ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'm4v');
    if (!allowedExt && !isVideoMime) continue;
    if (mime === MimeType.GOOGLE_DOCS || mime === MimeType.FOLDER) continue;
    out.push({ file: f, name: name, key: normToken_(name) });
  }
  out.sort(function (a, b) {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  return out;
}

/**
 * 比對順序：先找完全相符，再找「以別名開頭」。
 * 前綴比對時別名由長到短，避免 '1' 這種短別名搶走更精確的檔案。
 */
function pickCharacterVideo_(character, files) {
  var aliases = [];
  for (var i = 0; i < character.aliases.length; i++) {
    var k = normToken_(character.aliases[i]);
    if (k && aliases.indexOf(k) < 0) aliases.push(k);
  }
  if (!aliases.length) return null;

  var j, f;
  for (j = 0; j < files.length; j++) {
    f = files[j];
    if (!f.key) continue;
    if (aliases.indexOf(f.key) >= 0) return f;
  }
  aliases.sort(function (a, b) { return b.length - a.length; });
  for (var a = 0; a < aliases.length; a++) {
    for (j = 0; j < files.length; j++) {
      f = files[j];
      if (!f.key) continue;
      if (f.key === aliases[a] || f.key.indexOf(aliases[a]) === 0) return f;
    }
  }
  return null;
}

/* ======================================================================
 * CacheService（僅當快取用；拿不到就當沒有）
 * ==================================================================== */

function cacheGet_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var v = cache.get(key);
    return v === null || v === undefined ? '' : String(v);
  } catch (err) {
    return '';
  }
}

function cachePut_(key, value, seconds) {
  try {
    var cache = CacheService.getScriptCache();
    var ttl = toInt_(seconds, 300);
    if (ttl < 60) ttl = 60;      // CacheService 下限 60 秒
    if (ttl > 21600) ttl = 21600;
    cache.put(key, String(value), ttl);
  } catch (err) { /* 超過 100KB 等情況：靜默跳過快取 */ }
}

/* ======================================================================
 * 小工具
 * ==================================================================== */

function str_(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function toInt_(v, def) {
  var n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}

function toIntRange_(v, def, min, max) {
  var n = parseInt(v, 10);
  if (isNaN(n)) n = def;
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
}

function nowIso_() {
  return new Date().toISOString();
}

function isoOf_(date) {
  try {
    if (!date) return '';
    return new Date(date.getTime()).toISOString();
  } catch (err) {
    return '';
  }
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 14) + String(Date.now()).slice(-4);
}

function errObj_(code, message) {
  var e = { code: String(code), message: message === undefined ? '' : String(message), isHandled: true };
  return e;
}

function fail_(code, message) {
  var out = { ok: false, error: String(code) };
  if (message) out.message = String(message);
  return out;
}

/** 統一把 thrown 的東西變成回應物件：自訂錯誤用 code，其他一律 SERVER。 */
function failFromError_(err) {
  if (err && typeof err === 'object' && err.code) {
    return fail_(err.code, err.message || '');
  }
  if (typeof err === 'string') {
    return fail_('SERVER', err);
  }
  var msg = '';
  try { msg = (err && err.message) ? String(err.message) : String(err); } catch (e2) { msg = 'unknown error'; }
  return fail_('SERVER', msg);
}

function ok_(extra) {
  var result = { ok: true };
  if (extra && typeof extra === 'object') {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) result[key] = extra[key];
    }
  }
  return result;
}

/** 服務自我檢查（GET 沒帶 p 時）。 */
function serviceInfo_() {
  return {
    service: 'xiuxian-yaopai',
    version: VERSION,
    runtime: 'apps-script-v8',
    usage: 'POST body = {"v":1,"action":"<name>","payload":{}} 或 GET ?p=<encodeURIComponent(JSON)>',
    actions: [
      'init', 'register', 'login', 'logout', 'whoami', 'setFavorite', 'getVotes', 'getFeed',
      'createPost', 'deletePost', 'toggleLike', 'addComment', 'deleteComment', 'listDriveMedia',
      'characterVideos', 'submitSuggestion', 'mySuggestions', 'verify', 'stats'
    ]
  };
}
