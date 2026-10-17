# MedLog V1.4.1 每日漏記通知設定

V1.4.1 的通知服務與 V1.4.0 相同；既有 Worker 無需重新部署。

前端網址：https://lihe-source.github.io/PWA-med_log-GD/

每日計畫及服用記錄仍存在本機並透過 Google Drive 同步／備份。App 關閉後的通知，需要額外部署以下 Cloudflare Worker 與 D1。**只上傳 GitHub 前端檔案，無法啟用背景排程通知。** 通知服務尚未設定時，月曆、總覽、品項、每日計畫與 Drive 功能仍可使用。

## A. 先更新 PWA

1. 將本 ZIP 同名資料夾內的全部檔案上傳至 Repository 根目錄，保持扁平排列。
2. GitHub Pages 發佈後，開啟 PWA，確認右上角版本 **V1.4.1**。設定頁也能手動檢查更新。
3. 保留網站資料及原有 App 安裝，不要刪除、重裝或清除 IndexedDB。
4. 先讓所有會共用同一 Drive 資料夾的裝置更新至 V1.4.0 或以上版本。新版本可讀取 schema 1 的舊備份；每日計畫使用 schema 2，舊程式會拒絕新格式以保護資料。

## B. 產生一次性的推播金鑰

以 Safari、Chrome 或 Edge 開啟：

https://lihe-source.github.io/PWA-med_log-GD/notification-setup.html

按「產生 VAPID 公私鑰」，自行保存：

- `VAPID_PUBLIC_KEY`：公鑰，貼入 Worker 的一般變數。
- `VAPID_PRIVATE_KEY`：私鑰，貼入 Worker 的 **Secret**。不要放入 GitHub 或 PWA 設定表單。
- `VAPID_SUBJECT`：另自行設定成 `mailto:你的實際電子郵件`。包含 `mailto:`，不要使用 localhost、佔位文字或空白。

產生器在瀏覽器本機執行，不傳輸、不儲存金鑰。關閉頁面後不會替你保留。也可在電腦使用 Node.js 22 以上執行 `node notification-keygen.mjs`。

## C. Cloudflare Dashboard 部署（可手動複製貼上）

### 1. 建立 D1

在 Cloudflare Dashboard 的 D1 區域建立資料庫，建議名稱 `medlog-reminders`。

開啟該資料庫的 Console，貼上 **notification-schema.sql 的全部內容**並執行。執行後應有：`workspaces`、`devices`、`events`、`deliveries`、`limits` 五張資料表。SQL 可重複執行，不會刪除舊資料。

### 2. 建立 Worker 並加入模組

在 Workers & Pages 建立 Worker，建議名稱 `medlog-daily-reminder`。進入程式編輯器：

1. 主要模組使用 **notification-worker.mjs** 的全部內容。
2. 新增同層檔案 **push-crypto.mjs**，貼入同名檔案全部內容。
3. 新增同層檔案 **reminder-core.js**，貼入同名檔案全部內容。
4. 三個檔名必須與 import 完全一致，使用 ES Modules Worker。
5. 儲存並 Deploy。若 Dashboard 無法選擇入口檔名，可把主要程式貼進預設 `worker.js`；另兩個匯入檔名維持不變。

### 3. 綁定資料庫

Worker → Settings／Bindings → 新增 D1 binding：

| 欄位 | 填入 |
|---|---|
| Variable name／Binding name | `DB`（大寫） |
| D1 database | 剛建立的 `medlog-reminders` |

### 4. 填入變數與 Secret

Worker → Settings → Variables and Secrets：

| 名稱 | 類型 | 值 |
|---|---|---|
| `APP_URL` | 一般變數 | `https://lihe-source.github.io/PWA-med_log-GD/` |
| `ALLOWED_ORIGINS` | 一般變數 | `https://lihe-source.github.io` |
| `OAUTH_CLIENT_ID` | 一般變數 | 與 MedLog 設定頁完全相同的 Google OAuth Web Client ID |
| `VAPID_PUBLIC_KEY` | 一般變數 | B 步驟產生的公鑰 |
| `VAPID_PRIVATE_KEY` | **Secret** | B 步驟產生的私鑰 |
| `VAPID_SUBJECT` | 一般變數 | `mailto:你的實際電子郵件` |

`APP_URL` 包含專案路徑與結尾 `/`；`ALLOWED_ORIGINS` 只填來源，不含專案路徑。不要將 `https://lihe-source.github.io/PWA-med_log-GD/` 整串貼進 ALLOWED_ORIGINS。完成後儲存／重新部署。

### 5. 建立排程（這步不可省略）

Worker → Settings → Triggers／Cron Triggers → 新增：

```text
* * * * *
```

代表每分鐘執行一次。Cloudflare Cron 使用 UTC，程式會自行換算台灣時間，請不要再手動加減 8 小時。變更 Cron 後可能需要一段時間才生效。

### 6. 檢查服務

從 Worker Overview 複製實際的 `https://……workers.dev` 網址，用瀏覽器開啟其 `/health`，應看到 `ok: true` 及 `service: "MedLog Daily Reminder"`。健康檢查僅表示服務設定／資料庫可用；不等於裝置已收到通知或 Cron 已執行。

## D. PWA 中設定

1. 使用原本的 OAuth Client ID 自動連線 Google，選好 Drive 資料夾。
2. 設定 →「每日服用與提醒」，勾選每日品項、設定各自時間，按「儲存每日計畫」。預設時間 21:00 可自行修改；未勾選的品項不啟用。
3. 在同區塊貼上 Worker 網址，按「儲存服務網址」，再按「連結／同步狀態」，確認顯示已同步。
4. **每台會新增、修改或刪除服用記錄的裝置，都要連結同一個通知服務。** 服務網址及裝置授權不放進 Drive 備份；換裝置時須設定一次。
5. 要接收推播的裝置，按「啟用本機通知」並允許系統權限。其他裝置可只同步狀態、不接收通知。
6. iPhone／iPad 必須先透過 Safari「分享 → 加入主畫面」，再從主畫面 App 開啟並啟用通知。Safari 分頁與主畫面 App 的儲存空間及權限可能分開。
7. 按「測試通知」。成功訊息代表推播服務已接受，還要確認裝置真的顯示通知。
8. **另外驗證排程**：選一個今天尚未記錄的每日品項，將時間設為幾分鐘後，儲存並確認同步後關閉 App。到時應收到一則通知。
9. 再做反向驗證：另一個提醒時間前先完成記錄並同步，確認到時不通知。設定頁可查看最近排程檢查與結果。

啟用通知後，短期 Google 權杖到期不會停止伺服器既有排程；通知裝置使用可撤銷且有期限的獨立憑證。換帳號／資料夾時會停用原工作區在此裝置的通知。停用、切換或修改網址若遇到離線，會先保存停用要求，連線後重試；伺服器確認前仍可能收到舊提醒。

## E. 提醒規則與資料一致性

- 依 `Asia/Taipei` 日期判斷。當天至少有一筆該品項的有效記錄，即完成；不判斷服用數量是否滿足處方。
- 各品項每天設定一個提醒時間。同時段多個未記錄品項合併成一則通知。
- 每分鐘檢查，遇短暫排程延遲只補查最近 15 分鐘；不補發前一天或數小時前的提醒。
- 同一天、同一時間、同一裝置使用唯一發送紀錄與原子租約，防止 Cron 重疊重複發送。
- 暫時失敗最多嘗試三次；使用相同通知 tag／Topic 合併重試。網路回應遺失時無法承諾 exactly-once。HTTP 404／410 會停用失效訂閱。
- 每次記錄或計畫變更，都獨立同步通知所需狀態，與 Drive 自動備份開關分開。失敗保留待同步狀態；離線不阻擋本機記錄。
- 通知服務合併各裝置的不可變修訂，包含刪除與日期移動，避免舊裝置用過期摘要覆蓋新狀態。不同裝置真正同時修改的衝突仍依現有規則顯示、等待確認。
- Google Drive 是完整資料來源；D1 只存品項識別與啟用狀態、記錄日期／品項識別、計畫、必要修訂、裝置訂閱及發送紀錄，不存照片、品牌、藥名、成分、數量或 Google 權杖。
- 推播鎖定畫面顯示「今天還有 N 項每日品項尚未記錄」。點擊後進入對應帳戶／資料夾的當日列表；若正在編輯，會等待完成以保護草稿。
- 若某台裝置離線或未連結通知服務，伺服器無法得知該裝置最新記錄，可能仍發提醒。已交給推播服務的訊息無法保證即時收回。
- 通知可能受網路、系統、省電、專注模式或瀏覽器設定延遲；不是精確鬧鐘。裝置憑證有效期 180 天，到期後在下次 Google 有效連線時自動重新綁定。
- 通知訂閱、裝置憑證、Google 權杖、Worker 私鑰均不放進記錄匯出或 Drive 備份。清除網站資料會失去裝置憑證，請先在 App 停用通知；否則可能需要在 D1 停用相應裝置，直到舊憑證到期。

## F. 問題排除順序

| 狀況 | 先檢查 |
|---|---|
| 根路徑顯示不存在 | 本服務支援 `/` 及 `/health`；確認部署的是本版 Worker。 |
| 服務尚未設定 | 逐項補齊變數、Secret 及 `DB` binding。 |
| 資料庫尚未初始化 | 在正確 D1 執行 notification-schema.sql，確認 Worker 綁定同一個 DB。 |
| 網路正常卻連不到 | Worker URL、ALLOWED_ORIGINS 是否正確；公司網路是否阻擋 workers.dev；不要把路徑放進來源欄。 |
| OAuth 不符合 | Worker 的 OAUTH_CLIENT_ID 與 PWA 完全相同；確認 Google 已連線且該資料夾可編輯。 |
| 推播 400／401／403 | 公私鑰必須同一組、Subject 使用有效 mailto；換公鑰後每台裝置重新啟用。確認沒有沿用其他 PWA 的 Worker 或訂閱。 |
| 410／訂閱失效 | 回到原主畫面 App，重新啟用本機通知。 |
| iPhone／iPad 按了沒反應 | 從主畫面開啟、系統權限允許、未被專注模式隱藏；再按測試並查看服務訊息。 |
| 測試成功，但到時沒通知 | **先確認 Cron 已建立、最近排程檢查有更新**，再查台灣時間、今日是否已有記錄、品項／總開關是否啟用、本機訂閱是否啟用及狀態是否同步。 |
| 記錄後仍通知 | 查所有記錄裝置是否連結同一服務／Drive 工作區、是否離線待同步，以及通知是否在完成前已送出。 |
| 想停止舊裝置 | 原裝置按「停用本機通知」；無法存取原裝置時，可在 D1 devices 表將對應 device_id 的 enabled 改為 0，不必刪除事件資料。 |

## G. 電腦 CLI 部署（同一份程式）

使用目前支援的 Node.js LTS 與 Wrangler。先登入 Cloudflare，在本資料夾執行：

```bash
npx wrangler login
npx wrangler d1 create medlog-reminders
```

將回傳的資料庫 ID 及自己的 Client ID、公鑰、Subject 填入 `notification-wrangler.jsonc`，再執行：

```bash
npx wrangler d1 execute medlog-reminders --remote --file=notification-schema.sql --config=notification-wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY --config=notification-wrangler.jsonc
npx wrangler deploy --config=notification-wrangler.jsonc
```

`secret put` 出現輸入提示時貼入私鑰，不把私鑰寫進設定檔。設定檔已包含每分鐘 Cron。後續照 D 段在各裝置連結服務。

官方參考：
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/d1/get-started/
- https://www.rfc-editor.org/rfc/rfc8291
- https://www.rfc-editor.org/rfc/rfc8292
