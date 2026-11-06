# 修仙也要拍 · XiuXian Also Films

一個《修仙也要拍》的粉絲專頁網站，介面參考 Instagram（左側導覽 / 中央瀑布貼文 / 按讚 / 留言 / 限額式發文），
外觀走水墨仙俠風（飛劍、漣漪、符咒、印章）。**所有帳號、按讚、留言、建議都存進指定的 Google Drive 資料夾，
影片直接從 Drive 資料夾串流播放。**

> 不用架伺服器、不用資料庫：網站是純靜態檔案，後端是一段 Google Apps Script（跑在你自己的 Google 帳號裡）。
> 沒有連上 Apps Script 之前，網站會自動進入「示範模式」（資料存在瀏覽器），所有功能都能先玩一遍。

**長什麼樣子：** `docs/` 有 9 張實測截圖（`preview-1-language` 選擇語言 → `preview-2-waterdrop` 水滴漣漪 →
`preview-3-create-account` 建立帳號 → `preview-4-favorite-character` 七個角色 → `preview-5-sword-title` 開場飛劍＋霸氣文字 →
`preview-6-character-transition` 角色過場 → `preview-7-home-feed` 主頁 → `preview-8-settings` 設定 → `preview-9-mobile-home` 手機版 → `preview-10-stuck-rescue` 卡住救援列）。

---

## 目錄 / 檔案結構

```
xiuxian-yaopai/
├─ index.html                  全站單一頁面（語言 → 建立帳號 → 最愛角色 → 主頁/設定/建議）
├─ start-site.bat          ★雙擊這個就能開網站（自動開瀏覽器、自動換埠）
├─ serve.ps1               上面那個 .bat 實際叫用的本機小伺服器（別直接雙擊它）
├─ README.md                   本檔
├─ docs/                       預覽截圖
├─ assets/
│  ├─ css/app.css              版面與元件樣式（仙俠墨色 + 金色）
│  ├─ css/anim.css             過場動畫（開場飛劍、水滴漣漪、角色過場）
│  └─ js/
│     ├─ config.js   ★作者主要改這個：後端網址、資料夾 ID、角色、動畫節奏
│     ├─ i18n.js              繁體中文 / English 全部字串
│     ├─ api.js               資料層（雲端 Apps Script ＋ 本機示範模式）
│     ├─ transitions.js       動畫引擎（canvas 粒子 + CSS）
│     └─ app.js               畫面邏輯與互動
└─ google-apps-script/Code.gs  貼到 Google Apps Script 的後端（帳號/貼文/按讚/留言/建議 → Drive）
```

---

## 1. 先看效果（示範模式）

**方法 A（最快）：** 直接**雙擊 `index.html`**，瀏覽器打開就能玩全部功能（資料存在瀏覽器裡）。
> ⚠️ 只有**示範模式**（`appsScriptUrl` 留空）才能這樣開。**一旦填了 Apps Script 網址，就必須用方法 B**：
> `file://` 開的網頁會被瀏覽器擋掉雲端要求，帳號會變成「無法註冊／無法登入」。

**方法 B（推薦：要接 Google 後端、要穩定播雲端影片時用）：** **雙擊 `start-site.bat`**
它會自己啟動伺服器、自動避開被占用的埠，並自動開啟瀏覽器（一般是 **http://localhost:8123**；
視窗裡會顯示實際網址。那個黑色視窗就是伺服器，保持開著，關掉它網站就停）。
* 埠被占用：`start-site.bat 8321`（換個埠）。
* 視窗出現「Could not start the local server」→ 改用方法 A，或換埠再試。

> ⚠️ **別雙擊 `serve.ps1`**：Windows 預設的 PowerShell 執行原則會擋掉 `.ps1`，結果伺服器根本沒啟動，
> `http://localhost:8123` 就會「無法連線」。真要用它，請在 PowerShell 執行：
> `powershell -NoProfile -ExecutionPolicy Bypass -File ".\serve.ps1"`

接著：選語言 → 建立帳號 → 選最愛角色 → 進入主頁。
想看管理員視角（可以 PO 文）：登出後用 **名稱 `毛奈` / 密碼 `Rorkey@0820`** 登入。

想直接預覽某個畫面（作者常用，需走方法 B）：
   `http://localhost:8123/?shot=account`（建立帳號）、`?shot=fav`（角色）、`?shot=home`（主頁，會示範貼文）、
   `?shot=settings`、`?shot=suggest`、`?shot=intro`（開場飛劍）、`?shot=drop`（水滴漣漪）、
   `?shot=sword`（飛劍掠過）、`?shot=char&c=3`（第 4 個角色的過場）。再加 `&lang=en` 可看英文版。

> 示範模式的資料存在這台瀏覽器（localStorage + IndexedDB），換裝置或清瀏覽器資料就會不見。
> 要正式使用請做下面第 2 步。

---

## 1b. 網頁沒回應時的自動救援（卡住保護）

網站內建「安全氣囊」，不會再出現「整個畫面卡住、點了沒反應」的狀況：

* **3 秒**还没完成 → 畫面下方出現救急列：**「卡住了嗎？ → 返回登入畫面 / 關閉動畫」**。
* **9 秒**还没完成 → **自動返回登入畫面**（名稱會幫你填好），並暫停過場動畫。
* 雲端沒回應時，進站只等 **6 秒**就給你登入畫面（不會盯著空白畫面 20 秒）。
* 貼文抓不到 → 顯示「貼文載入失敗／沒有回應」＋**重新載入**／**返回登入**按鈕；連續失敗 3 次也會自動回登入畫面。
* **任何時候按 `Shift＋L`** → 強制回登入畫面（打字中不會誤觸）。
* 上次載入沒完成就關掉視窗 → **下次開啟直接進登入畫面**，並暫停動畫（會告訴你原因）。
* 網址加 **`?calm=1`** → 完全不做過場動畫（舊電腦、投影機、遠端桌面很好用）。

可在 `config.js` 調整（`site` 區塊）：

```js
recovery: true,        // 總開關：自動回登入畫面
rescueAfterMs: 3000,   // 幾秒後顯示救急按鈕
stuckAfterMs: 9000,    // 幾秒後自動回登入畫面
entryTimeoutMs: 6000,  // 進站時第一次雲端請求的上限
feedTimeoutMs: 9000,   // 貼文載入上限
calmOnStuck: true,     // 卡過一次就自動關動畫
```
另外 `motion.enabled: false` 可以在 config 裡直接永久關掉動畫；`backend.timeoutMs`（預設 12 秒）是單次雲端請求上限——
Apps Script 第一次被叫用（冷開機）常要 5–8 秒，這是正常的。

---

## 2. 接上 Google Drive（正式上線）

### 步驟（中文）

1. 到你的 Google Drive → 右上「新增」→「Apps Script 指令碼」。
2. 把 `google-apps-script/Code.gs` 的**全部内容**貼進去，儲存。
3. 確認專案使用 **V8**（編輯器左下角 / 專案設定）。
4. 「 Deploy（部署）→ New deployment（新的部署）→ 齿轮選擇 Web app（網頁應用程式）」
   * **Execute as（執行身份）：Me（我）**
   * **Who has access（使用對象）：Anyone（任何人）** ← 必須是 Anyone
5. 首次會跳出授權，選「進階 → 前往專案（未安全）→ 允許」。
6. 複製產生的 **Web app URL（結尾是 `/exec`）**。
7. 打開 `assets/js/config.js`，貼上去：
   ```js
   backend: {
     appsScriptUrl: 'https://script.google.com/macros/s/AKfycb.../exec',
     ...
   }
   ```
8. 重新整理網站 → 右上角「設定 → 測試雲端連線」看到「已連上 Google Drive 後端」就完成了。
9. **之後每次改 Code.gs，都要到「Manage deployments → 編輯 → Version: 新版本」重新部署**，否則 `/exec` 還在跑舊版。

### Steps (English)

1. Google Drive → New → Apps Script. 2. Paste `google-apps-script/Code.gs`, save, use the V8 runtime.
3. Deploy → New deployment → Web app → **Execute as: Me**, **Who has access: Anyone** → authorize (Advanced → Go to project → Allow).
4. Copy the `/exec` URL into `assets/js/config.js` → `backend.appsScriptUrl`. Refresh the site.
5. After every code change: Manage deployments → Edit → New version (otherwise `/exec` keeps running the old version).

### Drive 權限

* 後端用你的 Google 身份執行，所以**寫入資料夾不需要分享**。
* **但影片要能在網站上播放**，檔案就必須能被訪客的瀏覽器直接讀取：
  把「影片資料夾」（以及留言圖片資料夾，若要顯示留言圖）設為
  **共用 → 擁有連結的任何人 → 檢視者**。
* 建議再加一組 **Google Drive API 金鑰**（選填但強烈建議）：
  有金鑰時影片會用原生 `<video>` 播放（可拖進度、可全螢幕、载入快）；
  沒金鑰時網站會自動退回 Drive 內嵌播放器（iframe）。
  取得方式：Google Cloud Console → 建立專案 → 啟用 **Google Drive API** → 建立 **API 金鑰** →
  填到 `config.js` 的 `drive.apiKey`。

### 網站放到網路上

任何靜態空間都可以（只要透過 **https**）：GitHub Pages、Netlify、Cloudflare Pages、Google Cloud Storage…
直接把整個 `xiuxian-yaopai/` 上傳即可，`serve.ps1` 只在本機用。
不支援 `file://` 直接開啟（瀏覽器會擋掉 Drive 跨網域要求與本機儲存）。

---

## 3. 角色過場動畫：作者之後才補影片也 OK

第三步驟「請問你最喜歡哪個角色？」選完會播一段該角色的過場動畫，而且**之後每次進網站的開場動畫就會變成這個角色的動畫**
（沒選過的人、或還沒上傳影片的角色 → 使用預設的「飛劍掠過 + 修仙也要拍」霸氣文字）。

### 方式 A（最簡單）：把影片丟進資料夾，網站自己认

上傳影片到 `config.js` 裡 `drive.characterVideoFolderId` 指定的資料夾
（目前為 `1aON0l-mkuYXpBCHJkKHFVhpjpYGlo5dF`），**檔名用角色名或代號開頭**即可，網站會自動比對：

| # | 角色 | 可用的檔名前綴（任一個） |
|---|------|------------------------|
| 1 | 小師姐 | `小師姐`、`小师姐`、`xiao-shi-jie`、`xiaoshijie`、`1` |
| 2 | 師尊 | `師尊`、`师尊`、`shi-zun`、`shizun`、`2` |
| 3 | 大師兄 | `大師兄`、`大师兄`、`da-shi-xiong`、`dashixiong`、`3` |
| 4 | 二師姐 | `二師姐`、`二师姐`、`er-shi-jie`、`ershijie`、`4` |
| 5 | 三師兄 | `三師兄`、`三师兄`、`san-shi-xiong`、`sanshixiong`、`5` |
| 6 | 玄音老祖 | `玄音老祖`、`玄音`、`xuan-yin-lao-zu`、`xuanyin`、`6` |
| 7 | 作者小師弟 | `作者小師弟`、`作者小师弟`、`zuo-zhe-xiao-shi-di`、`author`、`7` |

副檔名可用 `.mp4 / .webm / .mov / .m4v`。
例：`小師姐.mp4`、`1 - 小師姐.mp4`、`xiao-shi-jie.webm`、`6 - 玄音.mkv` 都會命中。
（比較：先找「完全相符」的別名，再用前綴比對，所以 `1` 不會搶走 `10.mp4`。）

比對結果會快取 10 分鐘；上傳後想馬上看到：**設定 → 過場／影片資料夾 → 重新檢查雲端影片**。

### 方式 B：直接寫死 ID／網址（蓋過方式 A）

在 `config.js`：

```js
characterVideos: {
  'xiao-shi-jie': { fileId: '1AbCdEf...（Drive 檔案 ID）' },
  'shi-zun':      { url: 'https://your.cdn/master-intro.mp4' }
},
characterVideoFallback: 'fx'   // 沒有影片時改用內建特效（花瓣/符咒/飛劍/業火/雷劫/音波/水墨）
```

內建特效不需要任何素材，所以「還沒影片」的階段畫面也不會空板的。

---

## 4. 雲端裡存了什麼（資料存放對照表）

| 資料夾（config.js 鍵名） | 內容 |
|---|---|
| `usersFolderId` `11134-PV…` | **每個帳號一個文字檔** `帳號名稱.txt`（名稱＋密碼雜湊＋角色＋建立日期） |
| `videosFolderId` `1tsnPO7…` | 上傳的影片（貼文播放來源）；管理員發文時從這裡挑 |
| `characterVideoFolderId` `1aON0l-…` | 角色過場影片（作者後期補） |
| `commentsFolderId` `1gkygt0…` | 留言附的圖片／GIF 檔、`_comments_log.txt`（每則留言一行文字記錄），以及子資料夾 `_xiuxian_data/` 內的 `posts.json`（貼文＋按讚＋留言）、`votes.json`（角色票數）、`sessions.json`（登入 token） |
| `suggestionsFolderId` `1zAD-xm…` | **每個帳號一個** `帳號名稱.txt`，裡面是一條條建議（含時間） |

### 帳號文字檔長這樣（作者可以手動建立或修改）

```
# xiuxian-yaopai account
username: 青雲子
role: member
created: 2026-11-06T10:00:00.000Z
favorite: shi-zun
salt: 3f9c1a2b…
password_sha256: 8d2f…（64 字元）
note: 密碼以 SHA-256 + salt 雜湊儲存（可在 CONFIG.STORE_PLAINTEXT_PASSWORD 改為 true 以明文記錄）
```

* `role: admin` = 管理員（可發文／刪文）；`member` = 一般仙友。
* 想手動開帳號：新增 `名字.txt`，內容只寫 `username: 名字` 與 `password: 你的密碼` 兩行也能登入，
  下次登入時後端會自動把該檔升級成雜湊格式。
* **要改管理員密碼**：刪掉該檔的 `password_sha256:` 那行，改寫 `password: 新密碼`，用新密碼登入一次即可。
* 預設管理員是 `毛奈 / Rorkey@0820`（在 `Code.gs` 的 `CONFIG` 與前端 `config.js` 都可改）。

---

## 5. 日常操作

### 管理員 PO 文

1. 先把影片放進**影片資料夾**（Drive 網頁上傳即可，或發文時選「上傳檔案」——檔案上限 6MB）。
2. 網站主頁上方「發布貼文」→ 選 `影片 / 圖片 / GIF` → 「選擇媒體」：
   * **影片資料夾**：列出 Drive 影片資料夾裡的檔案，點一下就選好。
   * **圖片 / GIF 資料夾**：同上，選圖片或 GIF。
   * **上傳檔案**：直接從電腦上傳（小檔案方便）。
   * **貼上網址**：貼 Drive 連結或任何 mp4/webm/gif 直連結（會自動解析 Drive ID）。
3. 打說明文字 → 「發布」。只有管理員能發文與刪文。

> 要在清單裡看到 Drive 檔案，需要後端（Apps Script）或 `drive.apiKey`；兩者都沒有時請用「上傳檔案／貼上網址」。

### 仙友（一般帳號）

* 可以**按讚**：一人一次，再點一次就取消（雙擊媒體也會按讚）。
* 可以**留言**：文字、圖片、GIF（影片留言請改由管理員發貼文）。
* 「建議」頁只能打文字，送出後會存成該帳號專屬的 Drive 文字檔，管理員直接開檔就能看。

### 自動登入／登出

* 建立帳號或登入時勾「**自動登入**」→ 之後每次重開網頁，跑完開場動畫就直接進主頁。
* 沒勾 → 每次重開都要重新輸入名稱與密碼（預設就是這樣）。
* 「設定 → 登出」或側欄「登出」會清掉登入，直到下次手動登入。

### 換語言／換角色

設定頁可隨時改：語言（中文/English）、最愛角色（= 進場動畫）、自動登入開關、
重新檢查雲端影片、測試雲端連線、（管理員）網站統計。

---

## 6. 想改外觀／行為，改哪裡

| 想改的東西 | 檔案與位置 |
|---|---|
| 品牌名（中／英） | `config.js` → `site.brand.zh / .en`（全站含開場大字會一起改） |
| 七個角色、顏色、符號、特效 | `config.js` → `characters` 陣列（`fx`: petals/talisman/sword/flame/lightning/sound/ink） |
| 動畫速度 | `config.js` → `motion`（intro / waterDrop / swordPass / character） |
| 顏色風格 | `assets/css/app.css` 最上方 `:root` 變數（`--gold`、`--jade`、`--ink`…） |
| 上傳上限、留言長度、自動更新頻率 | `config.js` → `site.maxUploadBytes / commentMax / suggestMax`、`backend.pollMs` |
| 任何文字（雙語） | `assets/js/i18n.js`（zh 與 en 的鍵名請保持一一對應） |

已支援系統「減少動態效果」設定（`motion.reduceMotion: 'respect'`），無障礙友善。

---

## 7. 常見問題

| 狀況 | 原因／解法 |
|---|---|
| 瀏覽器說「無法連線 localhost:8123」 | 伺服器沒在跑：**雙擊 `start-site.bat`**（`serve.ps1` 直接雙擊會被 PowerShell 執行原則擋掉，等於沒啟動）；或退而**雙擊 `index.html`** |
| 進入後整個畫面變暗／按了沒反應（像卡死） | 過場動畫的覆蓋層沒收掉造成的假死。**已修**（動畫結束一定會把覆蓋層收掉，並加了卡住自動回登入，見第 1b 節）。若你自己遇到：網址加 **`?calm=1`** 或把 `config.js` 的 `motion.enabled` 改成 `false`，並按 **`Shift＋L`** 回登入畫面 |
| 填好 Apps Script 網址後，按「建立帳號／登入」沒反應、或說「連不到雲端」 | 兩個常見原因，都已修好：**① 直接雙擊 `index.html`（file://）時，瀏覽器會擋掉雲端要求** → 一定要用 `start-site.bat` 開 `http://localhost:8123`（或放上 https）。網站現在遇到這種情況會直接告訴你，不會假裝已連上。**② `/exec` 會 302 轉址，有時把 POST 內文遺失** → 後端會回一份「服務資訊」而不是結果；網站現在會自動改用 `GET ?p=<JSON>` 重送同一個動作（`Code.gs` 也改成這種情況回 `ok:false`，請重新部署一次） |
| 想確認後端有沒有部署成功 | 瀏覽器直接打開 `/exec`（不带参数）→ 應該看到 `{"ok":true,"service":"xiuxian-yaopai",...}`；看到 Google 登入頁／HTML 就是「使用對象」沒選 **所有人**；404 就是網址不對或沒部署新版本 |
| 畫面出現「示範模式：尚未連接 Google Drive 後端」 | `config.js` 的 `appsScriptUrl` 還沒填，或結尾少了 `/exec` |
| 按「測試雲端連線」出現權限錯誤／回傳一大段 HTML | 部署時「使用對象」不是 **Anyone**；或連到的是編輯器網址而不是 `/exec` |
| 影片格子里顯示「無法播放這個檔案…」 | 該檔案（或資料夾）沒有設成「擁有連結的任何人 → 檢視者」；或檔案太大需要病毒掃描確認 → 改用 Drive API 金鑰、或改放在「影片資料夾」 |
| 影片可以播但不能拖進度 | 沒金鑰時會走 Drive 內嵌播放器；加上 `drive.apiKey` 就是原生播放器 |
| Drive 清單是空的 | 清單需要後端或 `drive.apiKey`；先用「上傳檔案／貼上網址」 |
| 改了 Code.gs 沒效果 | 忘記在「Manage deployments」開新版本（`/exec` 綁版本） |
| 名稱都被說「已被使用」 | 名稱不分大小寫，且大小 2–20 字、不可有空白／標點／符號／emoji；可用中日韓英數字 |
| 留言／建議沒出現在 Drive | 檢查 `Code.gs` 的 `CONFIG` 資料夾 ID 是否為自己的；錯會回 `FOLDER_NOT_FOUND` |
| 手機版面 | 已做 RWD（手機用底部導覽），建議透過 https 部署後實測 |

---

## 8. 安全提醒（重要）

* 這專案把帳號資料放在你自己的 Drive，方便你直接查看／管理；密碼採 **SHA-256 + salt 雜湊**存放，
  但**登入驗證是這支 Apps Script 在把关**，所以 Apps Script 的 `/exec` 網址不要公開貼在別的地方。
* `config.js` 裡的預設管理員密碼是範例值，**上線第一件事就是改掉**（Drive 帳號檔改法見第 4 節）。
* 不建議把 `drive.apiKey` 設為無限用途；到 Google Cloud Console 加 HTTP 網域限制。
* 網站本身是靜態的，沒有任何伺服器日誌；資料只有你看得见。

---

## 9. 一次搞定檢查表

- [ ] 雙擊 `start-site.bat` → http://localhost:8123 能看到「選擇語言」
- [ ] Apps Script 貼上 `Code.gs`，部署為 Web app（Me / Anyone），拿到 `/exec`
- [ ] `config.js` 填 `backend.appsScriptUrl`
- [ ] 填了網址之後，**一律用 http:// 開啟**（不要雙擊 `index.html`，否則註冊／登入都會失敗）
- [ ] 影片／留言／角色／帳號／建議五個資料夾 ID 正確
- [ ] 影片與留言資料夾設為「擁有連結的任何人 → 檢視者」
- [ ] （建議）填 `drive.apiKey`
- [ ] 設定頁「測試雲端連線」成功、「重新檢查雲端影片」能抓到角色影片
- [ ] 改掉預設管理員密碼
- [ ] 上傳角色過場影片（檔名見第 3 節）→ 重新檢查 → 換角色試開場動畫
- [ ] 部署到 https 靜態主機，手機實測

Have fun — 修仙也要拍 🗡️
