# KML 軌跡播放器

以 Leaflet 顯示 KML 路線，支援瀏覽完整路線清單、查看精簡行程摘要，以及播放／暫停、進度跳轉和播放時顯示的即時高度剖面。

## 啟動

需要 Python 3。於專案目錄執行：

```bash
npm start
```

接著瀏覽 <http://localhost:8000>。也可以直接執行 `python3 -m http.server 8000`。

播放器透過 HTTP 載入 `data/routes.kml`，請使用本機伺服器開啟，不要直接以 `file://` 開啟 HTML。地圖圖磚和 Leaflet 目前由網路服務提供，使用時需連線。

## 專案結構

```text
.
├── data/
│   └── routes.kml       # 路線資料
├── src/
│   ├── kml.js           # KML 解析與描述欄位處理
│   ├── main.js          # 畫面初始化、資料載入與 UI 事件
│   ├── route-player.js  # 地圖圖層與軌跡播放狀態
│   └── elevation-chart.js # 高度剖面卡片
├── index.html           # 頁面結構
└── styles.css           # 頁面樣式
```

新增或替換路線時，將 KML 放到 `data/routes.kml` 即可；每個含有 `LineString` 的 KML `Placemark` 會成為一條可選路線。
