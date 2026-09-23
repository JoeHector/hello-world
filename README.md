# hello-world

Hi everyone
Here is Joe, I am a new comer in programming.

## 全球關注度熱點

`news-heatmap.html`：用 Wikimedia Pageviews API 的「各國熱門條目」資料，畫出各國每天在維基百科上關注什麼——世界地圖熱度、關注度前 10 名、單一國家的熱門條目，以及跨國熱門條目。

- 資料：`data/wiki-attention.json`，由 `scripts/fetch-wiki-attention.mjs` 產生（最近 7 天）。
- 自動更新：GitHub Actions（`.github/workflows/wiki-attention.yml`）每天 06:17 UTC 執行並 commit 新資料，也可在 Actions 頁面手動執行。
- 本機查看：瀏覽器不允許從 `file://` 讀取 JSON，請執行 `python3 -m http.server` 後開啟 `http://localhost:8000/news-heatmap.html`；或開啟 GitHub Pages。
