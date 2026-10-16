# KML 軌跡播放器

以 Leaflet 顯示 KML 路線的軌跡播放器：

- 依年份分組的路線清單，可搜尋並篩選自行車／健行
- 路線摘要卡：距離、時間、均速、總爬升、最高海拔
- 播放列：播放／暫停、前後跳轉、0.5×–8× 速度，以及即時里程、經過時間、海拔、坡度
- 高度剖面即進度條：可拖曳跳轉，滑過時在地圖上標示對應位置
- 點擊地圖上的路線即可跳到該處；「跟隨」模式讓鏡頭跟著目前位置移動
- 底圖切換（暗色／街道／地形／衛星），會記住上次的選擇
- 網址 `#route-N` 可直接開啟指定路線

鍵盤快捷鍵：`Space` 播放／暫停、`←` `→` 跳轉（加 `Shift` 跳更多）、`[` `]` 調整速度、`F` 跟隨、`+` `-` 縮放、`Home`／`End` 到起點／終點、`/` 搜尋。

## 啟動

需要 Node.js 18 以上，不需要安裝任何套件。於專案目錄執行：

```bash
npm start
```

接著瀏覽 <http://localhost:8000>。請透過這個伺服器開啟，不要直接以 `file://` 開啟 HTML。地圖圖磚（Esri、OpenStreetMap、OpenTopoMap）和 Leaflet 由網路服務提供，使用時需連線。

## 與 Google 我的地圖同步

路線來源設定在 `package.json` 的 `myMaps.mapId`（我的地圖網址中 `mid=` 後面那段）。地圖需設為「知道連結的使用者皆可檢視」。

- `npm start` 時，播放器載入路線會自動向我的地圖取得最新版並存到 `data/routes.kml`，最多每 `refreshMinutes` 分鐘（預設 5）同步一次；連不上時改用本機那份，側欄會顯示同步狀態。
- `npm run sync` 只下載、不啟動伺服器，可手動更新或排入排程。
- 只會保存含線段的地標（路線），地圖上的地點、餐廳等點位不會寫入專案。

不想同步時，刪除 `myMaps` 設定即可只使用本機的 `data/routes.kml`。

## 部署到 GitHub Pages

推送到 `main` 時，`.github/workflows/pages.yml` 會從我的地圖同步路線並部署到 GitHub Pages。

我的地圖更新後，到 GitHub 的 **Actions → 更新路線並部署 → Run workflow** 手動執行，約一分鐘後網站就會是最新路線；路線有變動時會自動 commit `data/routes.kml`（之後在本機改程式前記得先 `git pull`）。

第一次需要在 repo 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。

## 專案結構

```text
.
├── data/
│   └── routes.kml       # 路線資料
├── scripts/
│   ├── server.mjs       # 本機伺服器，載入路線時自動同步
│   ├── sync.mjs         # npm run sync：手動同步
│   └── my-maps.mjs      # 下載我的地圖 KML 並只保留路線
├── src/
│   ├── kml.js           # KML 解析與描述欄位統計
│   ├── track.js         # 軌跡幾何：距離索引、插值取樣、方位、坡度
│   ├── main.js          # 畫面初始化、資料載入、清單與 UI 事件
│   ├── route-player.js  # 播放時鐘、標記與鏡頭跟隨
│   ├── track-canvas.js  # 以 Canvas 逐格繪製路線，縮放時不會錯位
│   ├── smooth-zoom.js   # 逐格驅動的滾輪／雙擊／按鈕縮放
│   └── elevation-chart.js # 高度剖面兼進度條
├── index.html           # 頁面結構
└── styles.css           # 頁面樣式
```

新增或替換路線時，將 KML 放到 `data/routes.kml` 即可；每個含有 `LineString` 的 KML `Placemark` 會成為一條可選路線。
