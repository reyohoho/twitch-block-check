// Twitch Block Check — frontend SPA
// Probes Twitch domains (HTTPS + WebSocket + HLS) from the browser, shows per-category
// availability, an ISP/region breakdown, and ships anonymised reports back to the server.

// ===== i18n =====
let lang = "ru";
const T = {
  title:         {en:"Twitch Block Check",                           ru:"Проверка блокировок Twitch"},
  subtitle:      {en:"Crowdsourced detection of Twitch blocking in Russia (HTTPS, WebSocket, HLS)",
                  ru:"Краудсорсинговая проверка блокировок Twitch в России (HTTPS, WebSocket, HLS)"},
  ready:         {en:"Ready to run the test. Turn VPN off for accurate results.",
                  ru:"Готово к запуску теста. Для точных результатов отключите VPN."},
  test_running:  {en:"Test running…", ru:"Тест выполняется…"},
  test_done:     {en:"Test complete — submit your report to help the community.",
                  ru:"Тест завершён — отправьте отчёт, чтобы помочь сообществу."},
  submit_fail:   {en:"Could not reach the server. Check your network and try again.",
                  ru:"Сервер недоступен. Проверьте соединение и попробуйте снова."},
  report_sent:   {en:"Report sent successfully! Thank you.",
                  ru:"Отчёт успешно отправлен! Спасибо."},
  dns_warn:      {en:"Note: Test detects network-level (TSPU) blocking. DNS-level blocks and geo-restrictions may not be caught.",
                  ru:"Примечание: тест обнаруживает сетевые блокировки (ТСПУ). DNS-блокировки и геоограничения могут не определяться."},
  select_region: {en:"Click a region to see ISP breakdown", ru:"Нажмите на регион для статистики по провайдерам"},
  select_city:   {en:"Click a city to see ISP breakdown",   ru:"Нажмите на город для статистики по провайдерам"},
  isp_breakdown: {en:"ISP breakdown",                       ru:"Статистика по провайдерам"},
  not_russia:    {en:"Your IP is not in Russia. For measuring TSPU blocks, disable VPN. You can still run the test — results will reflect your current network.",
                  ru:"Ваш IP не в России. Для измерения блокировок ТСПУ отключите VPN. Тест можно запустить — результаты отразят текущую сеть."},
  checking:      {en:"Checking location…",                  ru:"Проверка местоположения…"},
  run:           {en:"Run Probe",                           ru:"Запустить проверку"},
  rerun:         {en:"Re-run Probe",                        ru:"Перезапустить проверку"},
  probing:       {en:"Probing",                             ru:"Проверяю"},
  priority_phase:{en:"Testing Twitch endpoints…",           ru:"Проверка эндпоинтов Twitch…"},
  retry_phase:   {en:"Retrying timeouts",                   ru:"Перепроверка таймаутов"},
  pct_main:      {en:"Twitch availability",                 ru:"Доступность Twitch"},
  pct_ru:        {en:"RU sites available",                  ru:"Доступность .ru сайтов"},
  done:          {en:"Done.",                               ru:"Готово."},
  reachable:     {en:"Reachable",                           ru:"Доступно"},
  blocked_label: {en:"Blocked",                             ru:"Заблокировано"},
  timeout_label: {en:"Timeout",                             ru:"Таймаут"},
  local_label:   {en:"Local filter",                        ru:"Локальный фильтр"},
  report_btn_ready:  {en:"Submit report",                    ru:"Отправить отчёт"},
  report_clean_ready:{en:"Submit clean report",              ru:"Отправить чистый отчёт"},
  submitting:    {en:"Submitting…",                         ru:"Отправка…"},
  geo_net:       {en:"Your network",                        ru:"Ваша сеть"},
  show_all:      {en:"All",                                 ru:"Все"},
  show_blocked:  {en:"Blocked only",                        ru:"Только заблокированные"},
  show_local:    {en:"Local only",                          ru:"Только локальные"},
  show_https:    {en:"HTTPS",                               ru:"HTTPS"},
  show_wss:      {en:"WebSocket",                           ru:"WebSocket"},
  rechecking:    {en:"Re-checking location…",               ru:"Перепроверка местоположения…"},
  live_feed:     {en:"Recent checks",                       ru:"Последние проверки"},
  world_map:     {en:"Twitch edge locations",               ru:"Расположение эдж-серверов Twitch"},
  more:          {en:"more",                                ru:"ещё"},
  tab_test:      {en:"Test",                                ru:"Тест"},
  tab_map:       {en:"Map",                                 ru:"Карта"},
  tab_stats:     {en:"Statistics",                          ru:"Статистика"},
  all_cities:    {en:"All cities",                          ru:"Все города"},
  all_providers: {en:"All providers",                       ru:"Все провайдеры"},
  all_time:      {en:"All time",                            ru:"За всё время"},
  last_24h:      {en:"Last 24 hours",                       ru:"За 24 часа"},
  last_week:     {en:"Last week",                           ru:"За неделю"},
  last_month:    {en:"Last month",                          ru:"За месяц"},
  reports:       {en:"Reports",                             ru:"Отчётов"},
  no_data:       {en:"No data",                             ru:"Нет данных"},
  available:     {en:"available",                           ru:"доступно"},
  unavailable:   {en:"unavailable",                         ru:"недоступно"},
  geo_unavailable:{en:"Location check failed",              ru:"Не удалось определить местоположение"},
  // twitch category names
  cat_main:      {en:"Twitch Main / Web",                   ru:"Twitch Main / Web"},
  cat_api:       {en:"Twitch API / GraphQL",                ru:"Twitch API / GraphQL"},
  cat_auth:      {en:"Auth",                                ru:"Авторизация"},
  cat_chat_ws:   {en:"Chat (WebSocket)",                    ru:"Чат (WebSocket)"},
  cat_streaming: {en:"Streaming / HLS / DRM",               ru:"Стриминг / HLS / DRM"},
  cat_cdn:       {en:"CDN / Assets",                        ru:"CDN / Ассеты"},
  cat_ads:       {en:"Ads",                                 ru:"Реклама"},
  cat_analytics: {en:"Analytics / Tracking",                ru:"Аналитика / Трекинг"},
  cat_dns:       {en:"DNS",                                 ru:"DNS"},
  cat_ext:       {en:"Extensions / Third-party",            ru:"Расширения / Сторонние"},
  cat_proxy:     {en:"Proxy (RKN/TSPU)",                    ru:"Прокси (РКН/ТСПУ)"},
};
function t(k){ return T[k]?.[lang] || T[k]?.en || k; }

// ===== State =====
let geoData = null, allResults = [], testDone = false, hasRunOnce = false, targets = null;
let targetsLoaded = false;
let currentFilter = "all";
let mapRussia = null, geoLayer = null, regionData = {};
let mapWorld = null, worldMarkers = [];
let domainGeo = {};
let priorityResults = {};   // domain -> {status, ms, proto}
let russiaGeoJson = null, cityData = {}, mapMode = "oblast";
let cityMarkers = [], russiaInfoCtrl = null;
let reportStatus = null;
let reportSubmitting = false;
let priorityFilter = "all"; // "all" | "failed"
let testRunning = false;
let apiReachable = false, pingInterval = null;
let geoInterval = null;
let _geoGen = 0, _geoFails = 0, _geoRefreshing = false;

// Russia cities/regions/ISPs for manual geo fallback
const RU_ISPS = [
  {v:"AS12389 PJSC Rostelecom",       label:"Ростелеком"},
  {v:"AS8359 MTS PJSC",               label:"МТС"},
  {v:"AS3216 PJSC Vimpelcom",         label:"Билайн"},
  {v:"AS25159 PJSC MegaFon",          label:"Мегафон"},
  {v:"AS34533 LLC Domru",             label:"Дом.ру"},
  {v:"AS15774 JSC Tattelecom",        label:"Таттелеком"},
  {v:"AS24955 JSC UfaNet",            label:"Уфанет"},
  {v:"AS20485 PJSC TransTeleCom",     label:"Транстелеком"},
  {v:"AS15378 Tele2 Russia",          label:"Tele2"},
  {v:"AS25513 PJSC Moscow city telephone network", label:"МГТС"},
];

// ===== Geo =====
async function getGeo(){
  try{
    const ctrl = new AbortController();
    setTimeout(()=>ctrl.abort(), 5000);
    const r = await fetch(
      "https://ip-api.com/json/?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,query",
      {cache:"no-store", signal:ctrl.signal}
    );
    const d = await r.json();
    if(d.status !== "success"){ _geoFails++; return null; }
    const asFull = d.as || "";
    const asParts = asFull.split(" ", 2);
    const asNum = asParts[0]?.startsWith("AS") ? asParts[0] : "";
    const isp = d.isp || d.org || "";
    const org = asNum ? `${asNum} ${isp}`.trim() : isp;
    _geoFails = 0;
    return {
      ip: d.query || "",
      city: d.city || "",
      region: d.regionName || "",
      country: d.countryCode || "",
      loc: `${d.lat},${d.lon}`,
      org,
      timezone: d.timezone || "",
    };
  }catch{ _geoFails++; return null; }
}
function geoProgressHTML(label){
  return `<div class="geo-card"><div class="geo-dot other" style="opacity:.4"></div><span style="color:#888">${label}</span>
    <div style="flex:1;max-width:120px;height:4px;background:#333;border-radius:2px;overflow:hidden;margin-left:8px"><div style="height:100%;background:#888;border-radius:2px;animation:geoprog 3s linear forwards"></div></div></div>`;
}
async function forceRefreshGeo(){
  if(_geoRefreshing) return;
  _geoRefreshing = true;
  const gen = ++_geoGen;
  document.getElementById("geo-box").innerHTML = geoProgressHTML(t("rechecking"));
  const data = await getGeo();
  _geoRefreshing = false;
  if(gen !== _geoGen) return;
  geoData = data;
  renderGeo(geoData); updateRunBtn(); updateVpnWarn();
}
function renderGeo(g){
  if(!g){
    document.getElementById("geo-box").innerHTML = `<div class="geo-card"><div class="geo-dot other" style="opacity:.4"></div><span style="color:#888">${t("geo_unavailable")}</span></div>`;
    return;
  }
  const isRu = g.country==="RU";
  const info = `<b>${t("geo_net")}:</b> ${g.ip||"?"} · ${g.city||"?"}, ${g.region||"?"}, ${g.country||"?"} · ISP: ${g.org||"?"}`;
  document.getElementById("geo-box").innerHTML = `
    <div class="geo-card" onclick="forceRefreshGeo()" style="cursor:pointer">
      <div class="geo-dot ${isRu?"ru":"other"}"></div>
      <span>${info}</span>
      <span style="color:#666;font-size:.85em;flex-shrink:0">↻</span>
    </div>`;
  if(isRu){ document.getElementById("geo-alert").innerHTML = ""; }
  else { document.getElementById("geo-alert").innerHTML = `<div class="alert alert-warn">${t("not_russia")}</div>`; }
}
async function refreshGeo(){ const gen = ++_geoGen; const d = await getGeo(); if(gen !== _geoGen) return; geoData = d; renderGeo(geoData); updateRunBtn(); updateVpnWarn(); }
function startGeoRefresh(){
  if(!geoData) document.getElementById("geo-box").innerHTML = geoProgressHTML(t("checking"));
  refreshGeo(); geoInterval = setInterval(refreshGeo, 15000);
}
function stopGeoRefresh(){ if(geoInterval){clearInterval(geoInterval); geoInterval=null;} }

// ===== i18n apply =====
function applyLang(){
  document.getElementById("lang-btn").textContent = lang==="ru"?"EN":"RU";
  document.getElementById("title").textContent = t("title");
  document.getElementById("subtitle").textContent = t("subtitle");
  document.getElementById("tab-test").textContent = t("tab_test");
  document.getElementById("tab-map").textContent = t("tab_map");
  document.getElementById("tab-stats").textContent = t("tab_stats");
  if(statsFiltersLoaded){
    document.getElementById("stats-city").options[0].textContent = t("all_cities");
    document.getElementById("stats-org").options[0].textContent = t("all_providers");
    const perEl = document.getElementById("stats-period");
    perEl.options[0].textContent = t("all_time");
    perEl.options[1].textContent = t("last_24h");
    perEl.options[2].textContent = t("last_week");
    perEl.options[3].textContent = t("last_month");
  }
  document.getElementById("live-label").textContent = t("live_feed");
  document.getElementById("world-label").textContent = t("world_map");
  document.querySelectorAll("[data-en]").forEach(el=>{
    el.textContent = el.getAttribute(`data-${lang}`) || el.getAttribute("data-en");
  });
  if(geoData) renderGeo(geoData);
  updateVpnWarn(); updateRunBtn();
  if(allResults.length){ renderSummary(); renderFilters(); renderResults(currentFilter); renderReportButtons(); }
  renderPriorityCards();
  if(mapRussia){
    const mp = document.getElementById("map-period"), prev = mp.value;
    mp.innerHTML = `<option value="">${t("all_time")}</option><option value="day">${t("last_24h")}</option><option value="week">${t("last_week")}</option><option value="month">${t("last_month")}</option>`;
    mp.value = prev;
  }
  if(!document.getElementById("panel-stats").classList.contains("hidden")) loadStats();
}
function toggleLang(){ lang = lang==="en"?"ru":"en"; applyLang(); }

function updateVpnWarn(){
  let html;
  if(reportStatus === "ok"){
    html = `<div class="alert alert-info" style="background:#001a00;border-color:#005500;color:#44dd44"><b>✓</b> ${t("report_sent")}</div>`;
  } else if(reportStatus === "error"){
    html = `<div class="alert alert-error">${t("submit_fail")}</div>`;
  } else if(testDone){
    html = `<div class="alert alert-info" style="background:#001a00;border-color:#005500;color:#44dd44">${t("test_done")}</div>`;
  } else if(testRunning){
    html = `<div class="alert alert-info" style="background:#001a00;border-color:#005500;color:#44dd44">${t("test_running")}</div>`;
  } else {
    html = `<div class="alert alert-info">${t("ready")}</div>`;
  }
  document.getElementById("vpn-warn").innerHTML = html;
  const bot = document.getElementById("vpn-warn-bottom");
  if(bot) bot.innerHTML = testDone ? html : "";
}
function updateRunBtn(){
  const btn = document.getElementById("run-btn");
  if(!targetsLoaded){ btn.textContent = t("checking"); btn.disabled = true; }
  else { btn.textContent = hasRunOnce ? t("rerun") : t("run"); btn.disabled = false; }
}

// ===== Probing =====
const TIMEOUT_MS = 8000;
const CONCURRENCY = 10;
const COUNTED_STATUSES = new Set(["ok","blocked","timeout"]);
const CLIENT_BLOCK_PATTERNS = [
  "err_blocked_by_client","blocked by client","ublock origin","adblock","ad blocker",
  "ns_error_redirect_loop","redirect loop","ns_error_tracking_uri","ns_error_content_blocked",
  "tracking protection","enhanced tracking protection",
  "cross-origin-resource-policy","cross origin resource policy",
  "opaqueresponseblocking","opaque response blocking","mixed content","ns_error_dom_corp",
];
function isCountedStatus(s){ return COUNTED_STATUSES.has(s); }
function isFailureStatus(s){ return s==="blocked" || s==="timeout"; }
function getResultStatus(r){
  if(r.ok) return "ok";
  if(r.clientBlocked) return "client";
  if(r.timedOut) return "timeout";
  if(!r.ok && r.ms < 20) return "client";
  return "blocked";
}
function getStatusLabel(s){
  if(s==="ok") return "OK";
  if(s==="blocked") return "BLOCKED";
  if(s==="timeout") return "TIMEOUT";
  if(s==="client") return "LOCAL";
  return s.toUpperCase();
}
function isClientSideBlockError(err){
  const raw = [err?.name, err?.message, err?.cause?.name, err?.cause?.message,
               typeof err === "string" ? err : ""].filter(Boolean).join(" ").toLowerCase();
  return CLIENT_BLOCK_PATTERNS.some(p => raw.includes(p));
}

function probeImg(host, timeout){
  return new Promise(resolve => {
    const img = new Image();
    const t0 = performance.now();
    const timer = setTimeout(()=>{ img.src=""; resolve({ok:false, ms:timeout, timedOut:true}); }, timeout);
    img.onload = () => { clearTimeout(timer); resolve({ok:true, ms:Math.round(performance.now()-t0), timedOut:false}); };
    img.onerror = () => { clearTimeout(timer); resolve({ok:false, ms:Math.round(performance.now()-t0), timedOut:false}); };
    img.src = `https://${host}/favicon.ico?_=${Date.now()}`;
  });
}

async function probeHttps(url, timeoutMs = TIMEOUT_MS){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try{
    await fetch(url, {mode:"no-cors", cache:"no-store", signal:ctrl.signal});
    clearTimeout(timer);
    return {ok:true, ms:Math.round(performance.now()-t0)};
  }catch(e){
    clearTimeout(timer);
    const ms = Math.round(performance.now()-t0);
    if(isClientSideBlockError(e)) return {ok:false, ms, timedOut:false, clientBlocked:true};
    const timedOut = e.name==="AbortError" || ms >= TIMEOUT_MS-500;
    const host = new URL(url).hostname;
    if(!timedOut){
      const imgResult = await probeImg(host, TIMEOUT_MS);
      if(imgResult.ok) return imgResult;
    }
    return {ok:false, ms, timedOut};
  }
}

// Reliability probe: hit the CDN domain N times with delayMs between requests.
// ok = all N succeeded; stores successCount/totalCount for display.
const RELIABILITY_TIMES   = 20;
const RELIABILITY_DELAY   = 50;   // ms between requests
const RELIABILITY_TIMEOUT = 3000; // per-request timeout

async function probeEntryReliability(entry, times = RELIABILITY_TIMES, delayMs = RELIABILITY_DELAY) {
  let successCount = 0, totalMs = 0;
  for (let i = 0; i < times; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, delayMs));
    const url = `https://${entry.d}/favicon.ico?_=${Date.now()}`;
    const r = await probeHttps(url, RELIABILITY_TIMEOUT);
    if (r.ok) successCount++;
    totalMs += r.ms;
  }
  const avgMs = Math.round(totalMs / times);
  const ok = successCount === times;
  const timedOut = !ok && successCount === 0 && avgMs >= RELIABILITY_TIMEOUT - 200;
  return { ok, ms: avgMs, timedOut, successCount, totalCount: times };
}

// WebSocket probe. We try to open a WSS connection; if it reaches `open` within timeout → OK.
// On a DPI-reset the connection is closed before open, with very low latency → treat as blocked.
// Timeout means the SYN/TLS handshake was silently dropped (also typical TSPU behaviour) → timeout.
function probeWss(url){
  return new Promise(resolve => {
    const t0 = performance.now();
    let settled = false;
    let ws;
    const finish = (res) => {
      if(settled) return;
      settled = true;
      try { ws && ws.close(); } catch {}
      resolve(res);
    };
    const timer = setTimeout(()=>finish({ok:false, ms:TIMEOUT_MS, timedOut:true}), TIMEOUT_MS);
    try{
      ws = new WebSocket(url);
    }catch(e){
      clearTimeout(timer);
      const ms = Math.round(performance.now()-t0);
      return finish({ok:false, ms, timedOut:false, clientBlocked:isClientSideBlockError(e)});
    }
    ws.onopen = () => {
      clearTimeout(timer);
      finish({ok:true, ms:Math.round(performance.now()-t0)});
    };
    ws.onerror = () => {
      clearTimeout(timer);
      const ms = Math.round(performance.now()-t0);
      finish({ok:false, ms, timedOut:false});
    };
    ws.onclose = (ev) => {
      if(settled) return;
      clearTimeout(timer);
      const ms = Math.round(performance.now()-t0);
      finish({ok:ev.wasClean===true && ws.readyState===3 && ms>50, ms, timedOut:false});
    };
  });
}

function buildProbeUrl(entry){
  const proto = entry.proto || "https";
  const path = entry.path || "/";
  return proto === "wss" ? `wss://${entry.d}${path}` : `https://${entry.d}${path==="/"?"/":path}`;
}
async function probeEntry(entry){
  const url = buildProbeUrl(entry);
  return entry.proto === "wss" ? probeWss(url) : probeHttps(url);
}

// ===== Targets loader and category grouping =====
async function loadTargets(){
  if(targets) return targets;
  const r = await fetch("/targets.json",{cache:"no-store"});
  targets = await r.json();
  for(const e of [...(targets.ru||[]), ...(targets.intl||[])]){
    if(e.lat && e.lon) domainGeo[e.d] = {lat:e.lat, lon:e.lon, country:e.country||"?", city:e.city||"?"};
  }
  return targets;
}
// PRIORITY categories derived from targets[intl].cat
const CATEGORY_ORDER = ["main","auth","api","chat_ws","streaming","cdn","ads","analytics","dns","ext","proxy","ref"];
const CATEGORY_I18N = {
  main:"cat_main", api:"cat_api", auth:"cat_auth",
  chat_ws:"cat_chat_ws", streaming:"cat_streaming",
  cdn:"cat_cdn", ads:"cat_ads", analytics:"cat_analytics",
  dns:"cat_dns", ext:"cat_ext", proxy:"cat_proxy", ref:"cat_ref"
};
function buildPriorityStructure(){
  const cats = {};
  const add = (entry, catId, category) => {
    if(!cats[catId]) cats[catId] = {id:catId, sites:[]};
    cats[catId].sites.push({
      d: entry.d,
      name: entry.d,
      proto: entry.proto || "https",
      path: entry.path,
      cat: catId,
      category, // "ru" | "intl"
      flag: entry.proto === "wss" ? "🔌" : (entry.country ? flagEmoji(entry.country) : "🌐"),
      tags: entry.tags || [],
    });
  };
  for(const e of (targets?.intl || [])){
    const c = e.cat || "ref";
    add(e, c, "intl");
  }
  for(const e of (targets?.ru || [])){
    add(e, "ru_alt", "ru");
  }
  if(cats.ru_alt) CATEGORY_I18N.ru_alt = "cat_ru";
  const order = [...CATEGORY_ORDER, "ru_alt"];
  return order.filter(id => cats[id]).map(id => cats[id]);
}
function flagEmoji(cc){
  if(!cc || cc.length!==2) return "🌐";
  const base = 127397;
  return String.fromCodePoint(base + cc.charCodeAt(0), base + cc.charCodeAt(1));
}
function catTitle(catId){
  const key = CATEGORY_I18N[catId];
  return key ? t(key) : catId;
}

function setPriorityFilter(f){ priorityFilter = f; renderPriorityCards(); }

// ===== Priority cards =====
function renderPriorityCards(){
  const el = document.getElementById("priority-section");
  if(!targets){ el.innerHTML = ""; return; }
  const structure = buildPriorityStructure();

  const totalFailed = structure.reduce((sum, cat) =>
    sum + cat.sites.filter(s => { const r=priorityResults[s.d]; return r && isFailureStatus(r.status); }).length, 0);

  const filterBar = `<div class="filter-bar" style="margin-bottom:6px">
    <span class="filter-btn ${priorityFilter==="all"?"active":""}" onclick="setPriorityFilter('all')">${t("show_all")}</span>
    <span class="filter-btn ${priorityFilter==="failed"?"active":""}" onclick="setPriorityFilter('failed')">${t("show_blocked")}${totalFailed>0?" ("+totalFailed+")":""}</span>
  </div>`;

  let cardsHtml = "";
  let anyVisible = false;

  for(const cat of structure){
    const title = catTitle(cat.id);
    let items = "";
    let okCount = 0, totalTested = 0, localCount = 0;

    const sitesToShow = priorityFilter === "failed"
      ? cat.sites.filter(s => { const r=priorityResults[s.d]; return r && isFailureStatus(r.status); })
      : cat.sites;

    if(priorityFilter === "failed" && sitesToShow.length === 0) continue;
    anyVisible = true;

    for(const site of sitesToShow){
      const r = priorityResults[site.d];
      const cls = r ? r.status : "pending";
      const icon = r
        ? (r.successCount != null
            ? `${r.successCount}/${r.totalCount}`
            : (r.status==="ok"?"✓":r.status==="blocked"?"✗":r.status==="timeout"?"⏱":"L"))
        : "…";
      if(r){
        if(isCountedStatus(r.status)){ totalTested++; if(r.status==="ok") okCount++; }
        else if(r.status==="client"){ localCount++; }
      }
      const msLabel = r
        ? (r.successCount != null ? `${r.successCount}/${r.totalCount} · ${r.ms}ms` : `${r.ms}ms`)
        : "";
      const protoCls = site.proto === "wss" ? "wss" : "https";
      const ciTags = site.tags && site.tags.length
        ? `<div class="ci-tags">${site.tags.map(tag=>`<span class="tag-badge">${tag}</span>`).join("")}</div>`
        : "";
      items += `<div class="cat-item ${cls}" title="${site.d}${msLabel?" · "+msLabel:""}">
        <span class="ci-flag">${site.flag}</span>
        <div class="ci-main">
          <span class="ci-name">${site.name}</span>
          ${ciTags}
        </div>
        <span class="ci-proto ${protoCls}">${site.proto}</span>
        <span class="ci-status ${cls}">${icon}</span>
      </div>`;
    }
    const bits = [];
    if(totalTested>0) bits.push(`<b>${okCount}</b> ${t("available")}`, `<b>${totalTested - okCount}</b> ${t("unavailable")}`);
    if(localCount>0) bits.push(`<b>${localCount}</b> ${t("local_label")}`);
    const summary = bits.join(", ");
    cardsHtml += `<div class="cat-card">
      <div class="cat-title">${title}</div>
      <div class="cat-grid">${items}</div>
      ${summary ? `<div class="cat-summary">${summary}</div>` : ""}
    </div>`;
  }

  if(priorityFilter === "failed" && !anyVisible){
    cardsHtml = `<div style="text-align:center;padding:14px;color:#22c55e;font-size:.82em">✓ ${lang==="ru"?"Нет заблокированных — всё доступно":"No failures — all reachable"}</div>`;
  }

  el.innerHTML = filterBar + cardsHtml;
}

// ===== Live feed =====
function addToLiveFeed(r){
  const el = document.getElementById("live-feed");
  const label = getStatusLabel(r.status);
  const protoCls = r.proto === "wss" ? "wss" : "https";
  const row = document.createElement("div");
  row.className = `feed-row ${r.status}`;
  const feedTags = r.tags && r.tags.length
    ? `<span class="feed-tags">${r.tags.map(t=>`<span class="tag-badge">${t}</span>`).join("")}</span>`
    : `<span class="feed-tags"></span>`;
  row.innerHTML = `<span class="proto ${protoCls}">${r.proto}</span><span class="domain">${r.domain}</span>${feedTags}<span class="ms">${r.ms}ms</span><span class="tag ${r.status}">${label}</span>`;
  el.prepend(row);
  while(el.children.length > 40) el.removeChild(el.lastChild);
}

// ===== World map =====
function initWorldMap(){
  if(mapWorld) return;
  mapWorld = L.map("map-world",{
    center:[30,20], zoom:2, zoomControl:true, attributionControl:false,
    worldCopyJump: false,
    maxBounds: [[-90,-180],[90,180]],
    maxBoundsViscosity: 1.0,
  });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{
    attribution:"© CARTO", maxZoom:18, noWrap: true,
  }).addTo(mapWorld);
}
function addWorldMarker(r){
  if(!mapWorld) return;
  const geo = domainGeo[r.domain];
  if(!geo || !geo.lat) return;
  const color = r.status==="ok"?"#22c55e":r.status==="timeout"?"#f59e0b":r.status==="client"?"#6b7280":"#ef4444";
  const marker = L.circleMarker([geo.lat, geo.lon],{radius:4,fillColor:color,color:color,weight:1,opacity:.8,fillOpacity:.6}).addTo(mapWorld);
  marker.bindTooltip(`${r.domain} (${geo.city||"?"}, ${geo.country||"?"}): ${getStatusLabel(r.status)} ${r.ms}ms`,{className:"info-panel"});
  worldMarkers.push(marker);
}

// ===== Report buttons =====
async function checkApiReachable(){
  try{
    const r = await fetch("/api/ping",{cache:"no-store"});
    const prev = apiReachable;
    apiReachable = r.ok;
    if(apiReachable !== prev){ renderReportButtons(); updateVpnWarn(); }
  }catch(e){ if(apiReachable){apiReachable=false; renderReportButtons(); updateVpnWarn();} }
}
function startPingPoll(){ if(!pingInterval) pingInterval = setInterval(checkApiReachable, 3000); checkApiReachable(); }
function stopPingPoll(){ if(pingInterval){clearInterval(pingInterval); pingInterval=null;} }
function renderReportButtons(){
  if(!testDone){
    document.getElementById("report-section-top").innerHTML = "";
    document.getElementById("report-section-bottom").innerHTML = "";
    return;
  }
  const blocked = allResults.filter(r=>isFailureStatus(r.status)).length;
  const label = blocked > 0 ? t("report_btn_ready") : t("report_clean_ready");
  // Submit is always enabled — no VPN gating. `apiReachable` is purely informational.
  const btnHtml = `<button class="btn-green" onclick="submitReport()">${label}</button>`;
  document.getElementById("report-section-top").innerHTML = btnHtml;
  document.getElementById("report-section-bottom").innerHTML = btnHtml;
}

// ===== Main test =====
async function runTest(){
  const btn = document.getElementById("run-btn");
  const status = document.getElementById("status");
  const progress = document.getElementById("progress");
  btn.disabled = true;
  testDone = false; testRunning = true; allResults = []; priorityResults = {}; reportStatus = null; reportSubmitting = false; priorityFilter = "all";
  apiReachable = false; stopPingPoll();
  progress.style.width = "0%"; status.textContent = "";
  worldMarkers.forEach(m=>m.remove()); worldMarkers = [];
  document.getElementById("live-feed").innerHTML = "";
  document.getElementById("report-section-top").innerHTML = "";
  document.getElementById("report-section-bottom").innerHTML = "";
  document.getElementById("report-status").innerHTML = "";
  document.getElementById("filter-container").innerHTML = "";
  document.getElementById("results").innerHTML = "";
  updateVpnWarn();
  stopGeoRefresh();

  document.getElementById("priority-section").classList.remove("hidden");
  document.getElementById("stats-section").classList.remove("hidden");
  document.getElementById("live-section").classList.remove("hidden");
  document.getElementById("world-section").classList.remove("hidden");
  initWorldMap();
  setTimeout(()=>mapWorld?.invalidateSize(), 100);

  renderPriorityCards();
  document.getElementById("summary-container").innerHTML = `<div class="alert alert-warn" style="font-size:.75em">${t("dns_warn")}</div>`;

  status.textContent = t("rechecking");
  geoData = await getGeo();
  renderGeo(geoData);
  // Geo lookup is best-effort only — tests run regardless of country / VPN status.
  // If geo failed (null), we just submit with empty geo metadata.

  // Resolve clip/VOD CDN domains before building the probe list
  await resolveDynamicCDN(status);

  status.textContent = t("priority_phase");
  const allEntries = [
    ...(targets.intl||[]).map(e => ({...e, category:"intl"})),
    ...(targets.ru||[]).map(e => ({...e, category:"ru"})),
  ];
  const totalSites = allEntries.length;
  let doneCount = 0;

  let idx = 0;
  async function worker(){
    while(idx < allEntries.length){
      const entry = allEntries[idx++];
      const r = entry._dynamic ? await probeEntryReliability(entry) : await probeEntry(entry);
      const st = getResultStatus(r);
      priorityResults[entry.d] = {
        status:st, ms:r.ms, proto:entry.proto||"https",
        ...(entry._dynamic && {successCount:r.successCount, totalCount:r.totalCount}),
      };
      const result = {
        domain: entry.d,
        category: entry.category,
        twitch_cat: entry.cat || (entry.category==="ru" ? "ru_alt" : "ref"),
        proto: entry.proto || "https",
        asn: entry.asn || "?",
        status: st,
        ms: r.ms,
        tags: entry.tags || [],
      };
      allResults.push(result);
      doneCount++;
      progress.style.width = `${(doneCount/totalSites*100).toFixed(0)}%`;
      status.textContent = `${t("priority_phase")}… ${doneCount}/${totalSites}`;
      addToLiveFeed(result); addWorldMarker(result);
      if(doneCount % 3 === 0 || doneCount === totalSites){ renderPriorityCards(); renderStats(); }
    }
  }
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, allEntries.length)}, () => worker()));

  // Retry timeouts once with lower concurrency
  const timedOut = allResults.filter(r=>r.status==="timeout");
  if(timedOut.length > 0){
    status.textContent = `${t("retry_phase")}… 0/${timedOut.length}`;
    let retryDone = 0, retryIdx = 0;
    async function retryWorker(){
      while(retryIdx < timedOut.length){
        const orig = timedOut[retryIdx++];
        const entry = allEntries.find(e => e.d === orig.domain) || {d: orig.domain, proto: orig.proto};
        const r = await probeEntry(entry);
        const st = getResultStatus(r);
        if(st !== "timeout"){
          orig.status = st; orig.ms = r.ms;
          priorityResults[orig.domain] = {status:st, ms:r.ms, proto:orig.proto};
          addToLiveFeed(orig); addWorldMarker(orig);
        }
        retryDone++;
        if(retryDone % 3 === 0 || retryDone === timedOut.length){
          status.textContent = `${t("retry_phase")}… ${retryDone}/${timedOut.length}`;
          renderPriorityCards(); renderStats();
        }
      }
    }
    await Promise.all(Array.from({length: Math.min(5, timedOut.length)}, () => retryWorker()));
  }

  renderPriorityCards();
  const order = {blocked:0, timeout:1, client:2, ok:3};
  allResults.sort((a,b)=>(order[a.status]-order[b.status]) || a.domain.localeCompare(b.domain));
  testDone = true; testRunning = false; hasRunOnce = true;
  renderSummary(); renderStats();
  renderFilters();
  renderResults("all");
  progress.style.width = "100%";
  status.textContent = t("done");
  updateRunBtn();
  updateVpnWarn();
  renderReportButtons();
  startPingPoll();
  startGeoRefresh();
  submitReport();
}

// ===== Render helpers =====
function renderSummary(){
  const ok = allResults.filter(r=>r.status==="ok").length;
  const bl = allResults.filter(r=>r.status==="blocked").length;
  const to = allResults.filter(r=>r.status==="timeout").length;
  const local = allResults.filter(r=>r.status==="client").length;
  document.getElementById("summary-container").innerHTML = `
    <div class="summary">
      <div class="summary-card"><div class="num c-green">${ok}</div><div class="label">${t("reachable")}</div></div>
      <div class="summary-card"><div class="num c-red">${bl}</div><div class="label">${t("blocked_label")}</div></div>
      <div class="summary-card"><div class="num c-yellow">${to}</div><div class="label">${t("timeout_label")}</div></div>
      ${local ? `<div class="summary-card"><div class="num c-gray">${local}</div><div class="label">${t("local_label")}</div></div>` : ""}
    </div>`;
}

function renderStats(){
  const el = document.getElementById("stats-section");
  // Overall Twitch availability = results where twitch_cat is a Twitch category (not ref/ru_alt)
  const twitchCats = new Set(["main","api","auth","chat_ws","streaming","cdn"]);
  const tw = allResults.filter(r => twitchCats.has(r.twitch_cat) && isCountedStatus(r.status));
  const ru = allResults.filter(r => r.category === "ru" && isCountedStatus(r.status));
  const twOk = tw.filter(r=>r.status==="ok").length, twTotal = tw.length;
  const ruOk = ru.filter(r=>r.status==="ok").length, ruTotal = ru.length;
  const twPct = twTotal ? Math.round(twOk/twTotal*100) : 0;
  const ruPct = ruTotal ? Math.round(ruOk/ruTotal*100) : 0;

  // Per-category stats from priorityResults
  const structure = buildPriorityStructure();
  let catHtml = "";
  for(const cat of structure){
    const title = catTitle(cat.id);
    const sites = cat.sites.filter(s => {
      const r = priorityResults[s.d];
      return r && isCountedStatus(r.status);
    });
    if(sites.length === 0) continue;
    const okCount = sites.filter(s => priorityResults[s.d].status === "ok").length;
    const okPct = Math.round(okCount/sites.length*100);
    catHtml += `<div class="stat-row">
      <span class="stat-cat">${title}</span>
      <div class="stat-bar-bg">
        <div class="stat-bar-ok" style="width:${okPct}%"></div>
        <div class="stat-bar-fail" style="width:${100-okPct}%"></div>
      </div>
      <span class="stat-count">${okCount}/${sites.length}</span>
    </div>`;
  }

  el.innerHTML = `
    <div class="stats-pct">
      <div class="stats-pct-card"><div class="pct" style="color:${twPct>70?"#22c55e":twPct>40?"#f59e0b":"#ef4444"}">${twPct}%</div><div class="pct-label">${t("pct_main")}</div><div style="font-size:.7em;color:#666;margin-top:2px">${twOk}/${twTotal}</div></div>
      ${ruTotal ? `<div class="stats-pct-card"><div class="pct" style="color:${ruPct>70?"#22c55e":ruPct>40?"#f59e0b":"#ef4444"}">${ruPct}%</div><div class="pct-label">${t("pct_ru")}</div><div style="font-size:.7em;color:#666;margin-top:2px">${ruOk}/${ruTotal}</div></div>` : ""}
    </div>
    ${catHtml}`;
  el.classList.remove("hidden");
}

function renderFilters(){
  const httpsCount = allResults.filter(r=>r.proto==="https").length;
  const wssCount   = allResults.filter(r=>r.proto==="wss").length;
  const blockedCount = allResults.filter(r=>isFailureStatus(r.status)).length;
  const localCount = allResults.filter(r=>r.status==="client").length;
  document.getElementById("filter-container").innerHTML = `
    <div class="filter-bar">
      <span class="filter-btn ${currentFilter==="all"?"active":""}" onclick="setFilter('all')">${t("show_all")} (${allResults.length})</span>
      <span class="filter-btn ${currentFilter==="blocked"?"active":""}" onclick="setFilter('blocked')">${t("show_blocked")} (${blockedCount})</span>
      ${localCount?`<span class="filter-btn ${currentFilter==="local"?"active":""}" onclick="setFilter('local')">${t("show_local")} (${localCount})</span>`:""}
      <span class="filter-btn ${currentFilter==="https"?"active":""}" onclick="setFilter('https')">${t("show_https")} (${httpsCount})</span>
      ${wssCount?`<span class="filter-btn ${currentFilter==="wss"?"active":""}" onclick="setFilter('wss')">${t("show_wss")} (${wssCount})</span>`:""}
    </div>`;
}
function setFilter(f){ currentFilter=f; renderFilters(); renderResults(f); }

function renderResults(filter){
  let filtered = allResults;
  if(filter==="blocked") filtered = allResults.filter(r=>isFailureStatus(r.status));
  else if(filter==="local")  filtered = allResults.filter(r=>r.status==="client");
  else if(filter==="https")  filtered = allResults.filter(r=>r.proto==="https");
  else if(filter==="wss")    filtered = allResults.filter(r=>r.proto==="wss");
  const show = filtered.slice(0, 300);
  const extra = filtered.length - show.length;
  let html = "";
  for(const r of show){
    const label = getStatusLabel(r.status);
    const protoCls = r.proto === "wss" ? "wss" : "https";
    const resTags = r.tags && r.tags.length
      ? `<span class="feed-tags">${r.tags.map(t=>`<span class="tag-badge">${t}</span>`).join("")}</span>`
      : `<span class="feed-tags"></span>`;
    html += `<div class="feed-row ${r.status}"><span class="proto ${protoCls}">${r.proto}</span><span class="domain">${r.domain}</span>${resTags}<span class="ms">${r.ms}ms</span><span class="tag ${r.status}">${label}</span></div>`;
  }
  if(extra>0) html += `<div style="text-align:center;padding:8px;color:#666;font-size:.8em">+${extra} ${t("more")}</div>`;
  document.getElementById("results").innerHTML = html;
}

// ===== Submit =====
async function submitReport(){
  const el = document.getElementById("report-status");
  if(!allResults.length || reportSubmitting || reportStatus === "ok") return;
  reportSubmitting = true;
  const payload = {
    ts: new Date().toISOString(),
    geo: geoData ? {ip:geoData.ip, city:geoData.city, region:geoData.region, country:geoData.country,
                    org:geoData.org, loc:geoData.loc, timezone:geoData.timezone,
                    manual_geo:!!geoData.manual_geo} : null,
    ua: navigator.userAgent,
    timeout_ms: TIMEOUT_MS,
    results: allResults.map(r=>({
      domain:r.domain, category:r.category, asn:r.asn,
      status:r.status, ms:r.ms, twitch_cat:r.twitch_cat, proto:r.proto,
      tags: r.tags || [],
    }))
  };
  el.textContent = t("submitting");
  try{
    const r = await fetch("/api/report",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(r.ok){
      reportStatus = "ok"; el.innerHTML = ""; stopPingPoll();
      // Refresh aggregated data so the new report appears on map and stats tab
      loadStats();
      if(mapRussia) refreshMapData();
    } else throw new Error(r.status);
  }catch(e){
    reportStatus = "error"; el.innerHTML = "";
  }
  reportSubmitting = false;
  updateVpnWarn();
  renderReportButtons();
}

// ===== CDN lookup helpers =====
let _clipCdnCache = null; // { slug, domains: [] }
let _vodCdnCache  = null; // { video_id, domains: [] }

function _extractSlug(raw) {
  const m = raw.match(/\/clip\/([^/?#\s]+)/);
  return m ? m[1] : raw.replace(/\s/g, "");
}
function _extractVodId(raw) {
  const m = raw.match(/\/videos\/(\d+)/);
  return m ? m[1] : raw.replace(/\D/g, "");
}

function _addDomainToTargets(domain, tags) {
  if (!targets) return false;
  if (targets.intl.some(e => e.d === domain)) return false;
  targets.intl.push({
    d: domain, asn: "AS16509", country: "US", city: "Ashburn",
    lat: 39.0438, lon: -77.4874, cat: "streaming", proto: "https",
    tags, _dynamic: true,
  });
  domainGeo[domain] = { lat: 39.0438, lon: -77.4874, country: "US", city: "Ashburn" };
  // Persist to targets.json so the domain survives page reloads and appears in stats for all users
  fetch("/api/add-target", {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({domain, tags}),
  }).catch(() => {});
  return true;
}

// ===== Clip CDN lookup =====

async function lookupClipCDN() {
  const raw = document.getElementById("clip-url-input").value.trim();
  if (!raw) return;
  const slug = _extractSlug(raw);
  const resultEl = document.getElementById("clip-cdn-result");
  resultEl.innerHTML = `<span style="color:#888;font-size:.78em">Resolving <b style="color:#fff">${slug}</b>…</span>`;
  try {
    const r = await fetch("/api/clip-cdn", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({slug}),
    });
    const data = await r.json();
    if (!r.ok || data.error) { resultEl.innerHTML = `<span style="color:#f44;font-size:.78em">${data.error||"Error"}</span>`; return; }
    _clipCdnCache = {slug: data.slug, domains: data.domains};
    renderClipCdnResult();
  } catch(e) { resultEl.innerHTML = `<span style="color:#f44;font-size:.78em">${e.message}</span>`; }
}

function renderClipCdnResult() {
  const el = document.getElementById("clip-cdn-result");
  if (!_clipCdnCache) return;
  el.innerHTML = _renderCdnDomains(_clipCdnCache.domains, _clipCdnCache.slug, "clips", "addClipCdnDomain");
}

async function addClipCdnDomain(domain) {
  _addDomainToTargets(domain, ["clips"]);
  await _probeAndAddResult(domain, ["clips"]);
  renderPriorityCards(); renderClipCdnResult();
}

async function lookupVodCDN() {
  const raw = document.getElementById("vod-url-input").value.trim();
  if (!raw) return;
  const video_id = _extractVodId(raw);
  if (!video_id) return;
  const resultEl = document.getElementById("vod-cdn-result");
  resultEl.innerHTML = `<span style="color:#888;font-size:.78em">Resolving VOD <b style="color:#fff">${video_id}</b>…</span>`;
  try {
    const r = await fetch("/api/vod-cdn", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({video_id}),
    });
    const data = await r.json();
    if (!r.ok || data.error) { resultEl.innerHTML = `<span style="color:#f44;font-size:.78em">${data.error||"Error"}</span>`; return; }
    _vodCdnCache = {video_id: data.video_id, domains: data.domains};
    renderVodCdnResult();
  } catch(e) { resultEl.innerHTML = `<span style="color:#f44;font-size:.78em">${e.message}</span>`; }
}

function renderVodCdnResult() {
  const el = document.getElementById("vod-cdn-result");
  if (!_vodCdnCache) return;
  el.innerHTML = _renderCdnDomains(_vodCdnCache.domains, `VOD ${_vodCdnCache.video_id}`, "vods", "addVodCdnDomain");
}

async function addVodCdnDomain(domain) {
  _addDomainToTargets(domain, ["vods"]);
  await _probeAndAddResult(domain, ["vods"]);
  renderPriorityCards(); renderVodCdnResult();
}

function _renderCdnDomains(domains, label, tag, addFn) {
  if (!domains.length) return `<span style="color:#888;font-size:.78em">No CDN domains found</span>`;
  const existing = new Set((targets?.intl||[]).map(e=>e.d));
  let html = `<div style="font-size:.72em;color:#888;margin-bottom:2px">CDN: <b style="color:#fff">${label}</b></div>`;
  for (const d of domains) {
    const inList = existing.has(d);
    const pr = priorityResults[d];
    const statusBadge = pr ? `<span class="tag ${pr.status}">${getStatusLabel(pr.status)} ${pr.ms}ms</span>` : "";
    html += `<div class="clip-cdn-domain">
      <span class="cdn-host">${d}</span>
      ${inList
        ? `<span class="tag-badge" style="background:#052e16;color:#22c55e">in list</span>${statusBadge}`
        : `<button class="btn-add-cdn" onclick="${addFn}('${d}')">+ Add & probe</button>`}
    </div>`;
  }
  return html;
}

async function _probeAndAddResult(domain, tags) {
  const entry = (targets?.intl||[]).find(e=>e.d===domain) || {d:domain, proto:"https", tags, _dynamic:true};
  const r = await probeEntryReliability(entry);
  const st = getResultStatus(r);
  priorityResults[domain] = {
    status:st, ms:r.ms, proto:"https",
    successCount:r.successCount, totalCount:r.totalCount,
  };
  if (testDone) {
    const existing = allResults.find(x=>x.domain===domain);
    const rec = {domain, category:"intl", twitch_cat:"streaming", proto:"https", asn:"AS16509", status:st, ms:r.ms, tags};
    if (existing) Object.assign(existing, rec); else allResults.push(rec);
    renderResults(currentFilter);
  }
}

let _liveCdnCache = null; // { channel, domains: [] }

function _extractChannel(raw) {
  const m = raw.match(/twitch\.tv\/([^/?#\s]+)/);
  return m ? m[1].toLowerCase() : raw.replace(/\s/g, "").toLowerCase();
}

async function lookupLiveCDN() {
  const raw = document.getElementById("live-url-input").value.trim();
  if (!raw) return;
  const channel = _extractChannel(raw);
  const resultEl = document.getElementById("live-cdn-result");
  resultEl.innerHTML = `<span style="color:#888;font-size:.78em">Resolving Live <b style="color:#fff">${channel}</b>…</span>`;
  try {
    const r = await fetch("/api/live-cdn", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({channel}),
    });
    const data = await r.json();
    if (!r.ok || data.error) { resultEl.innerHTML = `<span style="color:#f44;font-size:.78em">${data.error||"Error"}</span>`; return; }
    _liveCdnCache = {channel: data.channel, domains: data.domains};
    renderLiveCdnResult();
  } catch(e) { resultEl.innerHTML = `<span style="color:#f44;font-size:.78em">${e.message}</span>`; }
}

function renderLiveCdnResult() {
  const el = document.getElementById("live-cdn-result");
  if (!_liveCdnCache) return;
  el.innerHTML = _renderCdnDomains(_liveCdnCache.domains, `Live: ${_liveCdnCache.channel}`, "live-streams", "addLiveCdnDomain");
}

async function addLiveCdnDomain(domain) {
  _addDomainToTargets(domain, ["live-streams"]);
  await _probeAndAddResult(domain, ["live-streams"]);
  renderPriorityCards(); renderLiveCdnResult();
}

// Auto-resolve CDN for clip+vod+live inputs before running the test
async function resolveDynamicCDN(statusEl) {
  const tasks = [];
  const clipRaw = document.getElementById("clip-url-input")?.value.trim();
  const vodRaw  = document.getElementById("vod-url-input")?.value.trim();
  const liveRaw = document.getElementById("live-url-input")?.value.trim();

  if (clipRaw) tasks.push((async () => {
    if (statusEl) statusEl.textContent = "Resolving clip CDN…";
    try {
      const slug = _extractSlug(clipRaw);
      const r = await fetch("/api/clip-cdn", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({slug})});
      const data = await r.json();
      if (data.domains) {
        _clipCdnCache = {slug: data.slug, domains: data.domains};
        data.domains.forEach(d => _addDomainToTargets(d, ["clips"]));
        renderClipCdnResult();
      }
    } catch {}
  })());

  if (vodRaw) tasks.push((async () => {
    if (statusEl) statusEl.textContent = "Resolving VOD CDN…";
    try {
      const video_id = _extractVodId(vodRaw);
      if (!video_id) return;
      const r = await fetch("/api/vod-cdn", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({video_id})});
      const data = await r.json();
      if (data.domains) {
        _vodCdnCache = {video_id: data.video_id, domains: data.domains};
        data.domains.forEach(d => _addDomainToTargets(d, ["vods"]));
        renderVodCdnResult();
      }
    } catch {}
  })());

  if (liveRaw) tasks.push((async () => {
    if (statusEl) statusEl.textContent = "Resolving live CDN…";
    try {
      const channel = _extractChannel(liveRaw);
      if (!channel) return;
      const r = await fetch("/api/live-cdn", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({channel})});
      const data = await r.json();
      if (data.domains) {
        _liveCdnCache = {channel: data.channel, domains: data.domains};
        data.domains.forEach(d => _addDomainToTargets(d, ["live-streams"]));
        renderLiveCdnResult();
      }
    } catch {}
  })());

  await Promise.all(tasks);
}

// ===== Tabs =====
function showTab(name){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.getElementById("tab-"+name).classList.add("active");
  ["test","map","stats"].forEach(n=>document.getElementById("panel-"+n).classList.toggle("hidden",n!==name));
  if(name==="map") initRussiaMap();
  if(name==="stats") initStatsTab();
}

// ===== Statistics tab =====
let statsFiltersLoaded = false, statsFilterData = null;
async function initStatsTab(){
  if(!statsFiltersLoaded){
    try{
      statsFilterData = await (await fetch("/api/stats-filters")).json();
      const cityEl = document.getElementById("stats-city");
      cityEl.innerHTML = `<option value="">${t("all_cities")}</option>`+
        (statsFilterData.cities||[]).map(c=>`<option value="${c}">${c}</option>`).join("");
      updateOrgFilter();
      const perEl = document.getElementById("stats-period");
      perEl.innerHTML = `<option value="">${t("all_time")}</option><option value="day">${t("last_24h")}</option><option value="week">${t("last_week")}</option><option value="month">${t("last_month")}</option>`;
      statsFiltersLoaded = true;
    }catch(e){ console.error("stats-filters",e); }
  }
  loadStats();
}
function updateOrgFilter(){
  if(!statsFilterData) return;
  const city = document.getElementById("stats-city").value;
  const orgEl = document.getElementById("stats-org");
  const prev = orgEl.value;
  const orgs = city ? (statsFilterData.city_orgs?.[city] || []) : (statsFilterData.orgs || []);
  orgEl.innerHTML = `<option value="">${t("all_providers")}</option>`+orgs.map(o=>`<option value="${o}">${o}</option>`).join("");
  if(orgs.includes(prev)) orgEl.value = prev; else orgEl.value = "";
}
async function loadStats(){
  const city = document.getElementById("stats-city").value;
  const org = document.getElementById("stats-org").value;
  const period = document.getElementById("stats-period").value;
  const p = new URLSearchParams();
  if(city) p.set("city",city);
  if(org) p.set("org",org);
  if(period) p.set("period",period);
  try{
    const data = await (await fetch("/api/stats-priority"+(p.toString()?"?"+p:""))).json();
    renderStatsCards(data);
  }catch(e){
    document.getElementById("stats-cards").innerHTML = `<div style="color:#f44;font-size:.82em">Error loading stats</div>`;
  }
}
function renderStatsCards(data){
  document.getElementById("stats-report-count").textContent = `${t("reports")}: ${data.report_count}`;
  if(!data.report_count){
    document.getElementById("stats-cards").innerHTML = `<div style="color:#888;font-size:.82em;text-align:center;padding:20px">${t("no_data")}</div>`;
    return;
  }
  const structure = buildPriorityStructure();
  let html = "";
  for(const cat of structure){
    const title = catTitle(cat.id);
    let items = "", catOk = 0, catTotal = 0;
    for(const site of cat.sites){
      const s = data.domains[site.d];
      const protoCls = site.proto === "wss" ? "wss" : "https";
      const tagsHtml = (site.tags||[]).length
        ? `<div class="ci-tags">${site.tags.map(tag=>`<span class="tag-badge">${tag}</span>`).join("")}</div>` : "";
      if(!s || !s.total){
        items += `<div class="cat-item pending"><span class="ci-flag">${site.flag}</span><div class="ci-main"><span class="ci-name">${site.name}</span>${tagsHtml}</div><span class="ci-proto ${protoCls}">${site.proto}</span><span class="ci-status" style="color:#555">—</span></div>`;
        continue;
      }
      const okPct = s.ok/s.total*100;
      const cls = okPct<50?"blocked":okPct<90?"timeout":"ok";
      catOk += s.ok; catTotal += s.total;
      items += `<div class="cat-item ${cls}"><span class="ci-flag">${site.flag}</span><div class="ci-main"><span class="ci-name">${site.name}</span>${tagsHtml}</div><span class="ci-proto ${protoCls}">${site.proto}</span><span class="ci-status ${cls}">${okPct.toFixed(0)}%</span></div>`;
    }
    const catPct = catTotal?`<b>${(catOk/catTotal*100).toFixed(0)}%</b> ${t("available")}`:"";
    html += `<div class="cat-card"><div class="cat-title">${title}</div><div class="cat-grid">${items}</div>${catPct?`<div class="cat-summary">${catPct}</div>`:""}</div>`;
  }
  document.getElementById("stats-cards").innerHTML = html;
}

// ===== Russia map =====
async function initRussiaMap(){
  if(!mapRussia){
    mapRussia = L.map("map-russia",{
      center:[62,90], zoom:3, zoomControl:true, attributionControl:false,
      worldCopyJump: false,
      maxBounds: [[-90,-180],[90,180]],
      maxBoundsViscosity: 1.0,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{
      attribution:"© CARTO", maxZoom:18, noWrap: true,
    }).addTo(mapRussia);
    if(!russiaGeoJson){ const r = await fetch("/russia.geojson"); russiaGeoJson = await r.json(); }
    const perEl = document.getElementById("map-period");
    perEl.innerHTML = `<option value="">${t("all_time")}</option><option value="day">${t("last_24h")}</option><option value="week">${t("last_week")}</option><option value="month">${t("last_month")}</option>`;
  }
  await refreshMapData();
}
async function refreshMapData(){
  const period = document.getElementById("map-period")?.value || "";
  const qs = period ? `?period=${period}` : "";
  try { const r = await fetch("/api/map-data"+qs); regionData = await r.json(); } catch { regionData = {}; }
  try { const r = await fetch("/api/city-data"+qs); cityData = await r.json(); } catch { cityData = {}; }
  renderMapMode();
}
function setMapMode(mode){
  mapMode = mode;
  document.getElementById("map-mode-oblast").classList.toggle("active", mode==="oblast");
  document.getElementById("map-mode-city").classList.toggle("active", mode==="city");
  renderMapMode();
}
function renderMapMode(){
  clearCityMarkers();
  if(mapMode === "oblast") renderOblastMap();
  else renderCityMap();
}
function fractionColor(f){
  if(f===null) return "#333";
  if(f<0.05) return "#22c55e"; if(f<0.15) return "#84cc16"; if(f<0.3) return "#eab308";
  if(f<0.5) return "#f59e0b"; if(f<0.7) return "#f97316"; return "#ef4444";
}
function renderOblastMap(){
  if(geoLayer) mapRussia.removeLayer(geoLayer);
  if(russiaInfoCtrl) mapRussia.removeControl(russiaInfoCtrl);
  if(!russiaGeoJson) return;
  const info = L.control({position:"topright"});
  info.onAdd = function(){ this._div = L.DomUtil.create("div","info-panel"); this.update(); return this._div; };
  info.update = function(props, data){
    if(!props){ this._div.innerHTML = lang==="ru"?"Наведите на регион":"Hover over a region"; return; }
    const name = lang==="ru" ? (props.name||props.name_latin) : (props.name_latin||props.name);
    if(!data){ this._div.innerHTML = `<b>${name}</b><br>${t("no_data")}`; return; }
    const totalPct = data.total ? (((data.blocked||0)+(data.timeout||0))/data.total*100).toFixed(0) : "—";
    this._div.innerHTML = `<b>${name}</b><br>
      ${t("reports")}: ${data.reports}<br>
      ${t("blocked_label")}: ${totalPct}%`;
  };
  info.addTo(mapRussia);
  russiaInfoCtrl = info;
  document.getElementById("region-detail").innerHTML = `<div style="text-align:center;color:#666;font-size:.82em;padding:8px">${t("select_region")}</div>`;
  geoLayer = L.geoJSON(russiaGeoJson, {
    style: feature => {
      const rname = feature.properties.name_latin || feature.properties.name;
      const d = regionData[rname];
      if(!d) return {fillColor:"#333",weight:1,opacity:.7,color:"#555",fillOpacity:.7};
      const f = ((d.blocked||0)+(d.timeout||0)) / Math.max(d.total, 1);
      return {fillColor:fractionColor(f),weight:1,opacity:.7,color:"#555",fillOpacity:.7};
    },
    onEachFeature: (feature, layer) => {
      const rname = feature.properties.name_latin || feature.properties.name;
      layer.on({
        mouseover: e => { e.target.setStyle({weight:2,color:"#fff"}); info.update(feature.properties, regionData[rname]); },
        mouseout: e => { geoLayer.resetStyle(e.target); info.update(); },
        click: e => { mapRussia.fitBounds(e.target.getBounds()); loadISPs(rname, lang==="ru"?(feature.properties.name||rname):rname); }
      });
    }
  }).addTo(mapRussia);
}
function clearCityMarkers(){ cityMarkers.forEach(m=>m.remove()); cityMarkers=[]; }
function renderCityMap(){
  if(geoLayer) mapRussia.removeLayer(geoLayer);
  if(russiaInfoCtrl) mapRussia.removeControl(russiaInfoCtrl);
  if(russiaGeoJson){
    geoLayer = L.geoJSON(russiaGeoJson, {
      style: () => ({fillColor:"#1a1a1a",weight:1,opacity:.4,color:"#333",fillOpacity:.5}),
      interactive: false
    }).addTo(mapRussia);
  }
  document.getElementById("region-detail").innerHTML = `<div style="text-align:center;color:#666;font-size:.82em;padding:8px">${t("select_city")}</div>`;
  const entries = Object.entries(cityData);
  if(!entries.length) return;
  const maxReports = Math.max(...entries.map(([,d])=>d.reports));
  for(const [city, d] of entries){
    if(!d.lat || !d.lon) continue;
    const f = ((d.blocked||0)+(d.timeout||0)) / Math.max(d.total, 1);
    const radius = Math.max(6, Math.min(25, 6 + (d.reports/Math.max(maxReports,1))*19));
    const color = fractionColor(f);
    const marker = L.circleMarker([d.lat, d.lon],{radius,fillColor:color,color,weight:2,opacity:.9,fillOpacity:.6}).addTo(mapRussia);
    const totalPct = d.total ? (((d.blocked||0)+(d.timeout||0))/d.total*100).toFixed(0) : "—";
    marker.bindTooltip(`<div class="info-panel"><b>${city}</b> (${d.region||""})<br>${t("reports")}: ${d.reports}<br>${t("blocked_label")}: ${totalPct}%</div>`,{className:"",sticky:true});
    marker.on("click", () => loadISPs(city, city, "city"));
    cityMarkers.push(marker);
  }
}
async function loadISPs(key, displayName, mode="region"){
  const el = document.getElementById("region-detail");
  el.innerHTML = `<div class="cat-card"><div class="cat-title">${displayName} — ${t("isp_breakdown")}</div><div style="color:#888;font-size:.8em">Loading…</div></div>`;
  const url = mode === "city"
    ? `/api/region-isps?city=${encodeURIComponent(key)}`
    : `/api/region-isps?region=${encodeURIComponent(key)}`;
  try{
    const r = await fetch(url);
    const data = await r.json();
    const entries = Object.entries(data).sort((a,b) => b[1].total - a[1].total);
    if(!entries.length){
      el.innerHTML = `<div class="cat-card"><div class="cat-title">${displayName} — ${t("isp_breakdown")}</div><div style="color:#888;font-size:.8em">${t("no_data")}</div></div>`;
      return;
    }
    let rows = "";
    for(const [isp, s] of entries){
      const total = s.total || 1;
      const wOk = (s.ok/total*100).toFixed(0);
      const wTo = (s.timeout/total*100).toFixed(0);
      const wBl = (s.blocked/total*100).toFixed(0);
      rows += `<tr>
        <td style="color:#fff;font-weight:600;font-size:.78em">${isp}</td>
        <td style="font-size:.78em">${s.reports}</td>
        <td style="min-width:140px">
          <span class="bar" style="width:${wOk}%;background:#22c55e"></span><span class="bar" style="width:${wTo}%;background:#f59e0b"></span><span class="bar" style="width:${wBl}%;background:#ef4444"></span>
          <span style="color:#888;font-size:.7em;margin-left:4px">${s.ok}✓ ${s.timeout}⏱ ${s.blocked}✗</span>
        </td>
      </tr>`;
    }
    el.innerHTML = `<div class="cat-card">
      <div class="cat-title">${displayName} — ${t("isp_breakdown")}</div>
      <table class="asn-table">
        <thead><tr><th>ISP</th><th>${t("reports")}</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }catch(e){
    el.innerHTML = `<div class="cat-card"><div class="cat-title">${displayName}</div><div style="color:#f44;font-size:.8em">Error</div></div>`;
  }
}

// ===== Init =====
applyLang();
startGeoRefresh();

(async function preloadAssets(){
  const el = document.getElementById("asset-loading");
  const bar = document.getElementById("asset-progress");
  const detail = document.getElementById("asset-detail");
  const assets = [
    {name:"targets.json", load:()=>loadTargets()},
    {name:"russia.geojson", load:()=>fetch("/russia.geojson").then(r=>r.json()).then(d=>{russiaGeoJson=d;})},
  ];
  let done = 0;
  for(const a of assets){
    detail.textContent = a.name;
    try{ await a.load(); }catch(e){ console.error("[preload]", a.name, e); }
    done++;
    bar.style.width = `${(done/assets.length*100).toFixed(0)}%`;
  }
  targetsLoaded = true;
  updateRunBtn();
  el.remove();
})();

