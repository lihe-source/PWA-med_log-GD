# MedLog 服藥日誌 V1.1.1

部署位置：https://lihe-source.github.io/PWA-med_log-GD/

支援藥品、保健食品、外用保養品；採台灣時間與 24 小時制。程式不包含預設藥物或劑量建議。

## V1.1.1 底部留白修正

- App 外層改為正常文件排版，標頭、內容、導覽列仍為三列；內容獨立捲動，不會推動導覽列。移除 V1.1.0 固定容器及 未輸入時的 innerHeight 高度鎖定。
- 主畫面模式使用 CSS 完整視窗高度；Safari 一般分頁使用動態可見高度。避免 iOS 回報偏短高度時，在 App 下方留下接近狀態列高度的空帶。
- 底部安全區只由導覽列保留一次；按鈕高 48px，導覽列下方僅保留系統手勢間距。回收空間提供給月曆、品項與設定內容。
- 有輸入焦點且可見高度明顯縮小時，才啟用鍵盤版面；收起鍵盤或回到前景後恢復完整高度。保留雙指縮放，不鎖死縮放比例。
- 提示訊息定位在 App 內部、導覽列上方；橫向安全區一併處理。
- 舊資料、Google 連線設定、照片與 PWA 身分不變，不需要刪除 App 或清除網站資料。

更新方式：將 ZIP 內同名資料夾的全部檔案覆蓋到原 Repository 根目錄。部署完成後，在「設定 → 檢查更新」確認 V1.1.1，從多工畫面關閉 MedLog 再重新開啟。請勿只改 version.json。

## 保留 V1.1.0 照片功能

- 藥品／保健食品 → 新增或編輯品項 →「外觀照片」：拍照或選擇照片，每品項最多 3 張；儲存品項後才正式保存。
- 拍照按鈕優先使用後置鏡頭；電腦或不支援直接拍照的瀏覽器會開啟檔案選取器。可從相簿選圖。
- 點品項卡片的照片可放大，支援前後切換與原尺寸查看；照片上方顯示品項名稱。
- 可在編輯頁刪除照片，再按儲存。取消編輯不變更原照片。取代照片時先刪除一張再加入。
- 圖片在本機轉成 JPEG，最長邊 1600px，每張不超過 240 KB，會重新編碼移除原始 EXIF。原檔最大 25 MB；無法解碼的 HEIC 請轉 JPG 或重新拍照。
- 照片獨立存入 IndexedDB 事件，品項只保存照片識別碼；服藥記錄不複製圖片。離線可拍照、查看及記錄。
- 照片包含在 Google Drive 同步、本機 JSON 與雲端備份／還原。依現有帳戶與資料夾隔離，沒有額外影像分析或辨識服務。
- 同步以檔案大小與筆數分批，避免照片造成過大的變更檔案。單一備份仍限 50 MB；超過會明確停止並保留本機資料。
- 舊版資料、設定、PWA 身分與資料庫保留。使用照片前，請讓其他裝置也更新至 V1.1.0；舊版無法解析照片事件，會停止同步而保留本機資料。

## 1. 部署到 GitHub Pages

1. 解壓縮 ZIP，打開內部同名資料夾。
2. **上傳這個資料夾內的全部檔案**到 lihe-source/PWA-med_log-GD 的 main 分支根目錄；不要把整個版本資料夾再放入 Repository。
3. 根目錄應直接看得到 index.html、app.js、sw.js、version.json 與圖示。保留 .nojekyll。
4. GitHub Repository → Settings → Pages。
5. Source 選 Deploy from a branch；Branch 選 main、資料夾選 /(root)，按 Save。
6. 等 Pages 部署完成後開啟上方網址。第一次須連網，讓離線檔案快取完成。

使用不需要 Node、npm、Cloudflare 或另外建立後端。直接點開本機 index.html 的 file:// 模式不支援模組與 Service Worker；請用部署網址。

## 2. Google Cloud 首次設定

### 建立專案及 OAuth

1. Google Cloud Console 建立或選擇一個專案。
2. APIs & Services → Library，啟用 Google Drive API 及 Google Picker API。
3. Google Auth Platform → Branding，設定 App 名稱與支援 Email。
4. Audience：個人帳號通常選 External。若維持 Testing，將自己的 Google 帳號加入 Test users。access_denied 時先檢查測試使用者與專案發布狀態。
5. Data Access 加入 https://www.googleapis.com/auth/drive.file。
6. Clients → Create client → 類型選 Web application。
7. Authorized JavaScript origins 填入 **https://lihe-source.github.io**，不要填專案路徑或結尾斜線。
8. App 使用 Google Identity Services 彈出視窗授權，不需另填本 App 的 redirect URI。
9. 複製 OAuth Client ID。**Client Secret 不使用，也不要放入 GitHub。**

### Google Picker 憑證

1. APIs & Services → Credentials → Create credentials → API key。
2. 限制使用網站，加入 https://lihe-source.github.io/* 與 https://docs.google.com/*。
3. API restrictions 選 Restrict key，勾選 Google Picker API 與 Google Drive API。
4. IAM & Admin → Settings，複製數字形式的 Project number（專案編號），不是文字形式的 Project ID。
5. Client ID、API Key、專案編號必須來自同一個專案。

### 在 App 完成連線

1. 設定 → 帳戶與雲端，貼上 OAuth Client ID、Google Picker API Key 及專案編號。
2. 可貼上資料夾 ID 或 https://drive.google.com/drive/folders/... 完整網址。
3. 按「儲存連線設定」，再按「連線 Google」並授權。
4. 如果既有資料夾尚未授權，可能提示找不到資料夾。Google 授權通常仍已完成；按「選取資料夾」選取同一個資料夾。
5. 選定後程式檢查寫入權限、保存 ID 並同步。
6. 未指定既有資料夾時，也能只填 Client ID，連線後按「建立專用資料夾」。程式建立或沿用此 App 的「MedLog 服藥日誌」資料夾；此操作不需要 Picker API Key。
7. 其他裝置使用**相同 Client ID、Google 帳號與資料夾**，才能讀取本 App 已獲授權的資料。

drive.file 只允許存取此 App 建立或由選取器明確授權的檔案。選取資料夾不代表能讀取其中所有外部檔案；本 App 只同步自身資料與備份。自行移入的 JSON 可透過「匯入備份」還原。

OAuth Client ID／受限制的 API Key 是瀏覽器設定值，並非 Google 密碼。登入權杖只放在記憶體，不寫入備份。

## 3. 安裝

- iPhone／iPad：Safari 開啟部署網址 → 分享 → 加入主畫面。
- Windows Chrome／Edge：網址列安裝圖示或選單中的安裝功能。
- Android Chrome：選單 → 安裝應用程式／加入主畫面。

首次快取完成後，未登入、離線時也能記錄。不同瀏覽器、Safari 網頁與主畫面 App 的本機空間可能不同；建議在日常使用的 App 內完成設定，再透過同一個 Drive 資料夾同步。

## 4. 日常記錄

1. 藥品／保健食品 → 新增品項。
2. 填寫名稱、品牌、製造商、單位與月曆顏色。
3. 「以下成分標示於每幾個單位」：每顆填 1；每份 2 顆填 2。
4. 成分可新增多列，各有名稱、含量、單位；空白列可不填。
5. 點月曆日期 → 開啟「當日記錄」→ 新增保健品／藥品 → 選品項與數量，時間使用 24 小時制。
6. 「加入其他品項」可在同一時間記錄多種品項，各別設定數量。
7. 同品項不同時間可分別新增。月曆彙整次數，當日清單保留每一筆。
8. 在當日清單點選品項，可調整日期、時間、品項、數量與備註；儲存後回到更新後日期的清單。
9. 「返回當日」放棄表單修改並回到清單；右上角關閉回到月曆。刪除後可用提示中的「復原」還原。
10. 「本次成分含量」依歷史成分基準與記錄數量換算。

品項改名或改成分後，原記錄保留當時資訊。修改顏色會更新標籤。刪除常用品項不連動刪除歷史記錄。取消表單不觸發必填驗證。

## 5. 同步與帳戶隔離

- 記錄先寫入 IndexedDB，再排入同步佇列。
- 自動同步預設開啟，只在 App 開啟、網路與授權有效時執行。
- 權杖有期限，重新開啟或授權過期後可能要點「連線 Google」；純前端版本不保證永久自動登入。
- 首次把「本機資料」連結至選定帳戶時，本機資料與該帳戶資料合併；原本機工作區仍保留。
- 各 Google 帳戶／資料夾有獨立工作區，切換時不搬移上一個雲端帳戶的資料。
- 「本機資料」切換到原本的獨立本機工作區，此工作區不會上傳，直到再次綁定。
- 不同記錄自動合併；同筆同時修改會顯示「確認差異」。
- 刪除使用修訂標記，避免舊裝置直接復活已刪除資料。
- 變更檔案採追加方式，事件依唯一 ID 去重，重試不重複計入服用次數。

雲端 JSON 未額外加密，沿用指定 Drive 資料夾分享權限。GitHub 上傳的只有程式，不包含個人記錄。

## 6. 備份與復原

- 每天首次成功同步後建立自動備份，保留最新 30 份。
- 「雲端備份」建立手動備份；手動與還原前備份不自動刪除。
- 本機 JSON 包含完整修訂與刪除歷史，不包含 OAuth 權杖。
- 匯入或雲端還原先驗證，再顯示品項、記錄與差異數。
- 合併還原保留目前資料並加入備份修訂。
- 取代還原建立新修訂與刪除標記；之後收到離線裝置的不同修訂，會提示差異。
- 還原前保留本機安全備份，已連線時也建立雲端安全備份。設定頁可下載本機安全備份。
- 格式錯誤、來源不符、版本不支援、缺少修訂來源或超過 50 MB 時，停止匯入，不變更原資料。

清除瀏覽器資料、移除 App 或更換瀏覽器前，先確認雲端備份或匯出本機 JSON。

## 7. 程式更新

啟動、回到前景、恢復連線時比對 version.json。設定頁可查看目前與最新版本及手動檢查。

有新版時背景下載並檢查 SHA-256，保存草稿，等待儲存／同步完成後自動切換。離線或檔案不完整時保留原版。更新不清除 IndexedDB，也不清除其他 PWA 快取。

一般更新只需上傳新 ZIP 的全部檔案，不要只改 version.json。

自行修改原始碼時，在此資料夾執行「python3 release.py 1.1.2」（改成新版本號），同步更新 model.js、sw.js、HTML 版本及檔案校驗值，再上傳全部檔案。

Pages 尚在部署或新舊檔案暫時混用時，程式保留舊版，之後再檢查。

## 8. 常見問題

| 狀況 | 排查 |
|---|---|
| origin_mismatch | OAuth 來源只填 https://lihe-source.github.io |
| access_denied | 檢查 Audience、Test users、帳戶及同意畫面 |
| 404／找不到資料夾 | 確認 ID、帳戶，再透過選取器授權 |
| 403 | 檢查 API 是否啟用、可寫入權限、配額與錯誤原因 |
| API developer key is invalid | 檢查 API Key、Picker API、專案編號及包含 docs.google.com 的網站限制 |
| 彈出視窗被阻擋 | 點擊連線，允許 Google 視窗；必要時以 Safari 開啟 |
| 已儲存但未同步 | 檢查網路、授權、資料夾與自動同步開關 |
| 切換帳戶看不到原資料 | 連回原帳戶／資料夾或匯入備份 |
| 授權到期 | 重新連線；本機記錄仍保留 |
| 顯示舊版本 | 確認 Pages 部署與全部檔案更新，再檢查更新 |

## 9. 驗證範圍

所有檔案位於同一層，無第三方執行相依套件。Google 元件連網時由官方網域載入。

驗證結果見 VERIFICATION.txt。涵蓋資料模型、歷史含量、多裝置衝突、重試去重、備份驗證、頁面輸出跳脫與快取隔離。

製作環境沒有瀏覽器控制工具，因此未做真實 Safari／iPad／Windows 視覺與授權測試。真實 Drive、Picker、安裝與裝置版面須在部署後，以你的 Google 憑證和裝置驗證；程式不附帳戶憑證。
