/* ══════════════════════════════════════════════════════════════════════
   修仙也要拍 · 作者設定檔 (config.js)
   作者只需要改這個檔案就能把網站接上自己的 Google Drive / 後端。
   Author settings. Only this file normally needs editing.
   ══════════════════════════════════════════════════════════════════════ */

window.XX_CONFIG = {

  /* ── 1. 雲端後端 (Google Apps Script Web App URL) ─────────────────────
     貼上 Apps Script 部署後得到的 /exec 網址，網站就會把
     帳號 / 按讚 / 留言 / 建議 存到指定的 Google Drive 資料夾。
     留空 → 自動進入「示範模式」，資料存在瀏覽器本機。
     Leave empty to run in local demo mode.                         */
  backend: {
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbz1qrRyeozT7ATMtNXO1PTMo3jM3nssdac30Nfh-_r39FPKbiASJ7C8bp7CN-cu47pK/exec',
    transport: 'auto',        // 'auto' | 'post' | 'get'
    timeoutMs: 12000,         // 單次請求逾時（Apps Script 冷開機可能要 5-8 秒）
    pollMs: 25000             // 主頁自動更新間隔（0 = 關閉）
  },

  /* ── 2. Google Drive 資料夾 ID（照原樣保留即可）────────────────────── */
  drive: {
    videosFolderId:        '1tsnPO7S17lGqczndG4315q5n1jYOyAMw', // 上傳的影片（貼文播放）
    usersFolderId:         '11134-PVlis1jrKOiK9lKLuk7CamiUFD7', // 每個帳號一個文字檔
    characterVideoFolderId:'1aON0l-mkuYXpBCHJkKHFVhpjpYGlo5dF', // 角色過場影片（之後可補上）
    commentsFolderId:      '1gkygt0gJ953aPYzZQNbjtxi0UHwPYL2w', // 留言文字 / GIF / 圖片
    suggestionsFolderId:   '1zAD-xm89P1sgMTZs4ExVS3uxJMQTStDl', // 各帳號的建議文字檔

    /* 選填：Google Drive API 金鑰。有金鑰時影片可直接內嵌播放（最順），
       沒有金鑰時自動改用 Drive 預覽播放器（iframe）。
       Optional API key → smoother native <video> playback.          */
    apiKey: '',
    playback: 'auto',         // 'auto' | 'api' | 'download' | 'preview'
    publicShare: true         // 資料夾需「擁有連結的任何人有檢視權限」
  },

  /* ── 3. 管理員（預設 PO 文帳號）───────────────────────────────────────
     注意：這只是預設值，正式上架後請到 Drive 帳號檔修改密碼。   */
  admin: {
    username: '毛奈',
    displayName: { zh: '毛奈', en: 'MaoNai' }
  },

  /* ── 4. 角色清單（七個選項，含名稱、代號、過場特效）─────────────────
     fx: 'petals'花瓣 | 'talisman'符咒 | 'sword'飛劍 | 'flame'業火
         'lightning'雷劫 | 'sound'音波 | 'ink'水墨
     glyph: 中央大字／粒子用的符號
     aliases: 雲端影片檔名比對用（也接受代號、拼音、數字 1-7）         */
  characters: [
    { id: 'xiao-shi-jie', zh: '小師姐',  en: 'Junior Sister',      glyph: '❀', fx: 'petals',    c1: '#ff9ec4', c2: '#ffd9e6' },
    { id: 'shi-zun',      zh: '師尊',    en: 'The Master',         glyph: '☯', fx: 'talisman',  c1: '#e6c26b', c2: '#fff2c2' },
    { id: 'da-shi-xiong', zh: '大師兄',  en: 'Eldest Brother',     glyph: '⚔', fx: 'sword',     c1: '#7fc4ff', c2: '#dff0ff' },
    { id: 'er-shi-jie',   zh: '二師姐',  en: 'Second Sister',      glyph: '♨', fx: 'flame',     c1: '#ff8a5c', c2: '#ffd9b8' },
    { id: 'san-shi-xiong',zh: '三師兄',  en: 'Third Brother',      glyph: '⚡', fx: 'lightning', c1: '#a9e4ff', c2: '#ffffff' },
    { id: 'xuan-yin-lao-zu', zh: '玄音老祖', en: 'Elder XuanYin',   glyph: '☰', fx: 'sound',     c1: '#b49bff', c2: '#e4dcff' },
    { id: 'zuo-zhe-xiao-shi-di', zh: '作者小師弟', en: 'Author Disciple', glyph: '筆', fx: 'ink', c1: '#8ce0c0', c2: '#d9fff2' }
  ],

  /* ── 5. 角色過場影片：作者後期補影片的两种方式 ──────────────────────
     (A) 直接把影片上傳到 drive.characterVideoFolderId 資料夾，檔名前綴
         用角色名或代號即可，例如：
           小師姐.mp4 / xiao-shi-jie.mp4 / 1.mp4 / shi-zun.webm
         網站會自動讀取（內建檔名對應表，見 README）。
     (B) 或直接在本表單填檔案 ID / 網址（會蓋過 A）：
           'xiao-shi-jie': { fileId: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }
           'shi-zun':      { url: 'https://example.com/master.mp4' }                                        */
  characterVideos: {
    // 'xiao-shi-jie': { fileId: '' },
  },
  characterVideoFallback: 'fx',   // 沒有影片時使用 fx 特效；'none' = 一律只用通用轉場

  /* ── 6. 動畫節奏（數值越大越慢）───────────────────────────────────── */
  motion: {
    intro:      { sword: 1250, word:  900, hold: 800 },  // 開場：飛劍 + 霸氣文字
    waterDrop:  { fall:   900, splash: 1250, reveal: 700 },
    swordPass:  { total: 1450 },
    character:  { videoMin: 1400, videoMax: 4200, fx: 2100 },
    enabled: true,             // false = 全站不做過場動畫（舊電腦/卡住時救命用）
    reduceMotion: 'respect'      // 'respect' = 尊重系統「減少動態效果」設定
  },

  /* ── 7. 其他 ─────────────────────────────────────────────────────── */
  site: {
    brand: { zh: '修仙也要拍', en: 'XiuXian Also Films' },
    maxUploadBytes: 6000000,      // 上傳圖片/GIF 上限 6MB
    postCaptionMax: 600,
    commentMax: 400,
    suggestMax: 2000,
    commentsPreview: 2,

    /* ── 6b. 卡住救援：網頁沒回應時自動回到登入畫面 ─────────────────── */
    recovery: true,          // 總開關（false = 不自動跳回登入）
    rescueAfterMs: 3000,     // 操作超過這個時間 → 先顯示「卡住了嗎？」救急按鈕
    stuckAfterMs: 9000,      // 超過這個時間還沒完成 → 自動返回登入畫面
    entryTimeoutMs: 6000,    // 進站時第一次雲端請求上限（比 timeoutMs 短，更快給結果）
    feedTimeoutMs: 9000,     // 貼文載入上限，超過就顯示「載入失敗／重新載入」
    calmOnStuck: true        // 卡過一次之後順帶關掉過場動畫（顯示卡撐不住時的假死）
  }
};

/* 讓作者可以快速試後端而不用改檔：網址加 ?backend=<appsScriptUrl>
   (author shortcut: append ?backend=<your /exec url> to preview the cloud mode) */
(function () {
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('backend')) window.XX_CONFIG.backend.appsScriptUrl = q.get('backend');
    if (q.get('key')) window.XX_CONFIG.drive.apiKey = q.get('key');
    // ?calm=1 立刻關掉全部過場動畫（舊電腦、或畫面看起來卡住時用）
    if (q.get('calm') === '1' || q.get('calm') === 'true' || q.get('motion') === 'off') window.XX_CONFIG.motion.enabled = false;
  } catch (e) { }
}());

