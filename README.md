# KML 軌跡播放器

以 Leaflet 顯示 KML 路線的軌跡播放器：

- 依年份分組的路線清單，可搜尋並篩選自行車／健行
- 路線摘要卡：距離、時間、均速、總爬升、最高海拔
- 播放列：播放／暫停、前後跳轉、0.5×–8× 速度，以及即時里程、經過時間、海拔、坡度
- 高度剖面即進度條：可拖曳跳轉，滑過時在地圖上標示對應位置
- 點擊地圖上的路線即可跳到該處；「跟隨」模式讓鏡頭跟著目前位置移動
- 底圖切換（暗色／街道／地形／衛星），會記住上次的選擇
- 網址 `#route-N` 可直接開啟指定路線

鍵盤快捷鍵：`Space` 播放／暫停、`←` `→` 跳轉（加 `Shift` 跳更多）、`[` `]` 調整速度、`F` 跟隨、`Home`／`End` 到起點／終點、`/` 搜尋。

## 啟動

需要 Python 3。於專案目錄執行：

```bash
npm start
```

接著瀏覽 <http://localhost:8000>。也可以直接執行 `python3 -m http.server 8000`。

播放器透過 HTTP 載入 `data/routes.kml`，請使用本機伺服器開啟，不要直接以 `file://` 開啟 HTML。地圖圖磚（Esri、OpenStreetMap、OpenTopoMap）和 Leaflet 由網路服務提供，使用時需連線。

## 專案結構

```text
.
├── data/
│   └── routes.kml       # 路線資料
├── src/
│   ├── kml.js           # KML 解析與描述欄位統計
│   ├── track.js         # 軌跡幾何：距離索引、插值取樣、方位、坡度
│   ├── main.js          # 畫面初始化、資料載入、清單與 UI 事件
│   ├── route-player.js  # 地圖圖層、播放時鐘與鏡頭跟隨
│   └── elevation-chart.js # 高度剖面兼進度條
├── index.html           # 頁面結構
└── styles.css           # 頁面樣式
```

新增或替換路線時，將 KML 放到 `data/routes.kml` 即可；每個含有 `LineString` 的 KML `Placemark` 會成為一條可選路線。
