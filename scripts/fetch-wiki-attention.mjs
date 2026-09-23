// 從 Wikimedia Pageviews API 抓取各國每日最常被點閱的維基百科條目，
// 輸出 data/wiki-attention.json 供 news-heatmap.html 使用。
// API 說明：https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews
import fs from "node:fs/promises";

const COUNTRIES = ["FJ", "TZ", "EH", "CA", "US", "KZ", "UZ", "PG", "ID", "AR", "CL", "CD", "SO", "KE", "SD", "TD", "HT", "DO", "RU", "BS", "FK", "NO", "GL", "TF", "TL", "ZA", "LS", "MX", "UY", "BR", "BO", "PE", "CO", "PA", "CR", "NI", "HN", "SV", "GT", "BZ", "VE", "GY", "SR", "FR", "EC", "PR", "JM", "CU", "ZW", "BW", "NA", "SN", "ML", "MR", "BJ", "NE", "NG", "CM", "TG", "GH", "CI", "GN", "GW", "LR", "SL", "BF", "CF", "CG", "GA", "GQ", "ZM", "MW", "MZ", "SZ", "AO", "BI", "IL", "LB", "MG", "PS", "GM", "TN", "DZ", "JO", "AE", "QA", "KW", "IQ", "OM", "VU", "KH", "TH", "LA", "MM", "VN", "KP", "KR", "MN", "IN", "BD", "BT", "NP", "PK", "AF", "TJ", "KG", "TM", "IR", "SY", "AM", "SE", "BY", "UA", "PL", "AT", "HU", "MD", "RO", "LT", "LV", "EE", "DE", "BG", "GR", "TR", "AL", "HR", "CH", "LU", "BE", "NL", "PT", "ES", "IE", "NC", "SB", "NZ", "AU", "LK", "CN", "TW", "IT", "DK", "GB", "IS", "AZ", "GE", "PH", "MY", "BN", "SI", "FI", "SK", "CZ", "ER", "JP", "PY", "YE", "SA", "CY", "MA", "EG", "LY", "ET", "DJ", "UG", "RW", "BA", "MK", "RS", "ME", "XK", "TT", "SS"];
const DAYS = 7;          // 頁面顯示的天數
const TRY_DAYS = 9;      // 往回多抓幾天，避開尚未發布的日期
const TOP_KEEP = 5;      // 每國每日保留的熱門條目數
const TOP_GLOBAL = 10;   // 計算跨國熱門時，每國取前幾名
const CONCURRENCY = 6;
const UA = "hello-world-news-heatmap/1.0 (https://github.com/JoeHector/hello-world)";
const OUT = new URL("../data/wiki-attention.json", import.meta.url);

// 首頁、搜尋頁等非條目頁面
const NAMESPACE = /^(Special|Wikipedia|WP|Portal|File|Help|Category|Template|User|Talk|Spezial|Spécial|Especial|Speciale|Speciaal|Specjalna|Служебная|Спеціальна|Özel|Istimewa|Khusus|Đặc_biệt|特別|特殊|특수|พิเศษ|خاص|מיוחד|विशेष|Wikipédia|Wikipedie|Википедия|Вікіпедія|ویکی‌پدیا|ויקיפדיה|위키백과|Vikipedi|Wikipedysta|Anexo|Ficheiro|Datei|Fichier):/i;
const MAIN_PAGES = new Set(["Main_Page", "Hauptseite", "Pagina_principale", "Página_principal", "Strona_główna",
  "Заглавная_страница", "Головна_сторінка", "Anasayfa", "Halaman_Utama", "Trang_Chính", "Hoofdpagina", "Huvudsida",
  "Forside", "Etusivu", "Hlavní_strana", "Kezdőlap", "Pagina_principală", "Κύρια_Σελίδα", "Početna_strana",
  "Glavna_stran", "Accueil_principal", "Portada", "-", "Undefined"]);
const isArticle = (title, project) =>
  /^[a-z-]+\.wikipedia$/.test(project) && !NAMESPACE.test(title) && !MAIN_PAGES.has(title);

const pad = n => String(n).padStart(2, "0");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    if (res.status === 404) return null; // 該國該日無資料（流量低於隱私門檻或尚未發布）
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error(`retries exhausted: ${url}`);
}

async function fetchCountryDay(cc, date) {
  const [y, m, d] = date.split("-");
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top-per-country/${cc}/all-access/${y}/${m}/${d}`;
  const json = await getJSON(url);
  const articles = json?.items?.[0]?.articles;
  if (!Array.isArray(articles)) return null;
  const rows = articles
    .map(a => ({ t: a.article, p: a.project, v: a.views_ceil ?? a.views ?? 0, r: a.rank ?? 0 }))
    .filter(a => a.t && isArticle(a.t, a.p))
    .sort((a, b) => b.v - a.v);
  return { total: rows.reduce((s, a) => s + a.v, 0), rows };
}

async function pool(tasks, n) {
  const out = new Array(tasks.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); }
  }));
  return out;
}

const today = new Date();
const dates = Array.from({ length: TRY_DAYS }, (_, k) => {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - TRY_DAYS + k));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
});

const jobs = [];
for (const cc of COUNTRIES) for (const date of dates) jobs.push(async () => {
  try { return { cc, date, res: await fetchCountryDay(cc, date) }; }
  catch (e) { console.warn(String(e)); return { cc, date, res: null }; }
});
const results = await pool(jobs, CONCURRENCY);

// 只保留有足夠國家回傳資料的日期，取最近 DAYS 天
const coverage = Object.fromEntries(dates.map(d => [d, results.filter(r => r.date === d && r.res).length]));
console.log("coverage", coverage);
const days = dates.filter(d => coverage[d] >= COUNTRIES.length * 0.3).slice(-DAYS);
if (days.length === 0) throw new Error("沒有任何日期取得資料");

const countries = {};
const global = days.map(() => new Map());
for (const { cc, date, res } of results) {
  const di = days.indexOf(date);
  if (di < 0 || !res) continue;
  const c = (countries[cc] ??= { v: days.map(() => null), top: days.map(() => null) });
  c.v[di] = res.total;
  c.top[di] = res.rows.slice(0, TOP_KEEP).map(a => [a.t, a.p, a.v]);
  for (const a of res.rows.slice(0, TOP_GLOBAL)) {
    const key = a.p + "|" + a.t;
    const g = global[di].get(key) ?? { t: a.t, p: a.p, v: 0, c: [] };
    g.v += a.v; g.c.push(cc); global[di].set(key, g);
  }
}
const globalTop = global.map(m => [...m.values()]
  .sort((a, b) => b.c.length - a.c.length || b.v - a.v)
  .slice(0, 15));

const out = {
  generated: new Date().toISOString(),
  source: "Wikimedia Pageviews API · top-per-country (all-access)",
  days, countries, global: globalTop
};
await fs.mkdir(new URL("../data/", import.meta.url), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(out));
console.log(`wrote ${days.length} days, ${Object.keys(countries).length} countries`);
