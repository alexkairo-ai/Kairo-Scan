const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec';
const EDIT_PASS = '1990';
const PHOTO_ROOT_URL = 'https://drive.google.com/drive/folders/1zk8c6qGUBNcVQAUlucU5cedBKIQNu5GZ';
const photoStages = new Set(['hdf','prisadka','upakovka']);

// ========== Локализация этапов ==========
const stageNamesRu = {
  'pila': 'Пила',
  'hdf': 'ХДФ',
  'kromka': 'Кромка',
  'prisadka': 'Присадка',
  'upakovka': 'Упаковка',
  'fasady': 'Фасады'
};

// ========== IndexedDB настройки ==========
const DB_NAME = 'KairoScanDB';
const DB_VERSION = 2;
const STORE_NAME = 'reports_cache';
let db = null;

// ========== DOM элементы ==========
const orderInput = document.getElementById("order");
const workerInput = document.getElementById("worker");
const statusEl = document.getElementById("status");
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const startBtn = document.getElementById("startCam");
const msg = document.getElementById("msg");
const stageTitle = document.getElementById("stageTitle");
const scanOverlay = document.getElementById("scanOverlay");

const mainView = document.getElementById("mainView");
const reportsView = document.getElementById("reportsView");
const openReportsBtn = document.getElementById("openReports");
const closeReportsBtn = document.getElementById("closeReports");
const reportsStatus = document.getElementById("reportsStatus");
const reportsTableBody = document.querySelector("#reportsTable tbody");
const editReportsBtn = document.getElementById("editReports");
const openPhotoStoreBtn = document.getElementById("openPhotoStore");

const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const statsDate = document.getElementById("statsDate");
const statsStage = document.getElementById("statsStage");
const statsBtn = document.getElementById("statsBtn");
const statsResult = document.getElementById("statsResult");

const pdfFrom = document.getElementById("pdfFrom");
const pdfTo = document.getElementById("pdfTo");
const exportPdfBtn = document.getElementById("exportPdf");

const printArea = document.getElementById("printArea");
const pager = document.getElementById("pager");

let page = 1;
const perPage = 20;

let stream = null, locked = false, starting = false, stopTimer = null, editMode = false;
let rawReports = [], currentReports = [], filterTerm = '', sortMode = 'time_desc';
let reportsTimer = null, reportsLoading = false, currentFilter = 'day';
let reportsReqId = 0;

const deletedTombstones = new Map();
function reportKey(r) {
  return [r.db, r.order, r.stage, r.name, r.ts, r.date, r.time].join('|');
}
function reportId(r) { return reportKey(r); }

function showScanOverlay(order) {
  if (scanOverlay) {
    scanOverlay.textContent = 'Готово: ' + order;
    scanOverlay.classList.remove('hidden');
  }
}
function hideScanOverlay() {
  if (scanOverlay) scanOverlay.classList.add('hidden');
}
function isStreamActive() { return stream && stream.getTracks().some(t => t.readyState === "live"); }
function showScanButton(show) { startBtn.style.display = show ? "block" : "none"; }
function stopCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; if (stopTimer) clearTimeout(stopTimer); showScanButton(true); }
function freezeCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); locked = true; if (stopTimer) clearTimeout(stopTimer); showScanButton(true); }

const savedName = localStorage.getItem('workerName') || '';
if (savedName) workerInput.value = savedName;
workerInput.addEventListener('input', () => localStorage.setItem('workerName', workerInput.value.trim()));

function parseDbOrderClient(raw) {
  const s = String(raw || '').trim();
  if (s.includes('|')) {
    const parts = s.split('|');
    return { db: parts[0].trim(), order: parts.slice(1).join('|').trim() };
  }
  return { db: '', order: s };
}

// ========== ИСПРАВЛЕННАЯ ФУНКЦИЯ startCamera ==========
async function startCamera() {
  if (starting) return;
  starting = true;
  
  // Предварительная проверка разрешений (если поддерживается)
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const perm = await navigator.permissions.query({ name: 'camera' });
      if (perm.state === 'denied') {
        msg.innerHTML = "⚠️ Доступ к камере запрещён. Разрешите в настройках браузера и перезагрузите страницу.";
        showScanButton(true);
        starting = false;
        return;
      }
    } catch (e) {}
  }
  
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (e1) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e2) {
      msg.innerHTML = "Камера не запустилась. Проверьте HTTPS, доступ и закрытие других приложений.";
      console.log(e1, e2);
      showScanButton(true);
      starting = false;
      return;
    }
  }

  try {
    video.srcObject = stream;
    // Принудительно устанавливаем muted и autoplay для обхода политик автоплея
    video.muted = true;
    video.autoplay = true;
    await video.play();
    locked = false;
    hideScanOverlay();
    showScanButton(false);
    if (stopTimer) clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { if (!locked) { msg.innerHTML = "Сканирование остановлено. Нажмите «СКАНИРОВАТЬ»."; stopCamera(); } }, 20000);
    scan();
  } catch (e3) {
    msg.innerHTML = "Не удалось запустить видео. Обновите страницу и попробуйте снова.";
    console.log(e3);
    stopCamera(); // останавливаем, чтобы можно было повторить попытку
  } finally {
    starting = false;
  }
}
startBtn.addEventListener("click", startCamera);

function callApiJsonp(params, cb, onError) {
  const cbName = 'cb_' + Math.random().toString(36).slice(2);
  let done = false;
  window[cbName] = function () { };
  const timeout = setTimeout(() => { if (!done) { done = true; if (onError) onError("⚠️ Нет ответа от сервера"); } }, 30000);
  window[cbName] = function (res) {
    if (done) return;
    done = true; clearTimeout(timeout); cb(res);
    setTimeout(() => delete window[cbName], 30000);
  };
  const query = new URLSearchParams(params);
  query.set('api', '1'); query.set('callback', cbName); query.set('_ts', Date.now().toString());
  const script = document.createElement('script');
  script.src = API_URL + '?' + query.toString();
  script.onerror = () => { if (done) return; done = true; clearTimeout(timeout); if (onError) onError("⚠️ Ошибка связи с сервером"); };
  document.body.appendChild(script);
}

function flashStage(btn) {
  btn.classList.add('stage-active');
  setTimeout(() => btn.classList.remove('stage-active'), 700);
}

function sendStage(stage, color, btn, photoUrl, facades) {
  const parsed = parseDbOrderClient(orderInput.value);
  const raw = parsed.order;
  const db = parsed.db;
  const name = workerInput.value.trim();
  if (!raw) { statusEl.innerHTML = "Введите/сканируйте номер"; return; }
  if (!name) { statusEl.innerHTML = "Введите имя"; return; }
  if (btn) flashStage(btn);
  statusEl.innerHTML = "Отправка...";
  callApiJsonp({
    action: 'mark',
    stage,
    order: raw,
    name,
    color: color || '',
    db: db,
    photo_url: photoUrl || '',
    facades: (facades === true ? '1' : facades === false ? '0' : '')
  },
    res => { statusEl.innerHTML = res.ok ? "✅ Готово" : "⚠️ " + res.msg; },
    err => { statusEl.innerHTML = err; }
  );
}

const hasBarcodeDetector = ('BarcodeDetector' in window);
const detector = hasBarcodeDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;

// ========== ИСПРАВЛЕННАЯ ФУНКЦИЯ scan ==========
function scan() {
  if (locked) return;
  if (!isStreamActive()) {
    // Камера не активна – не сканируем, пользователь должен нажать кнопку заново
    return;
  }

  if (hasBarcodeDetector) {
    detector.detect(video).then(codes => {
      if (codes && codes.length) {
        const data = codes[0].rawValue || '';
        orderInput.value = data;
        msg.innerHTML = "✅ Готово!";
        if (navigator.vibrate) navigator.vibrate(80);
        showScanOverlay(data);
        const printSpan = document.getElementById('printOrderNumber');
        if (printSpan) printSpan.textContent = 'Заказ: ' + data;
        freezeCamera();
        return;
      }
      requestAnimationFrame(scan);
    }).catch(() => requestAnimationFrame(scan));
    return;
  }

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (code) {
      orderInput.value = code.data;
      msg.innerHTML = "✅ Готово!";
      if (navigator.vibrate) navigator.vibrate(80);
      showScanOverlay(code.data);
      const printSpan = document.getElementById('printOrderNumber');
      if (printSpan) printSpan.textContent = 'Заказ: ' + code.data;
      freezeCamera();
      return;
    }
  }
  requestAnimationFrame(scan);
}

const urlParams = new URLSearchParams(location.search);
const only = (urlParams.get('only') || '').toLowerCase();
const view = (urlParams.get('view') || '').toLowerCase();

document.querySelectorAll('#stageButtons button').forEach(btn => {
  const stage = btn.dataset.stage;
  const key = (btn.dataset.only || stage).toLowerCase();
  const color = btn.dataset.color || '';
  btn.onclick = () => {
    if (photoStages.has(stage)) {
      openPhotoDialog(stage, color, btn);
    } else {
      sendStage(stage, color, btn, '');
    }
  };
  if (only && key !== only) btn.style.display = 'none';
});
if (only) stageTitle.textContent = "Этап:";

function openFacadesDialog(onChoose) {
  const overlay = document.createElement('div');
  overlay.id = 'facadesOverlay';
  overlay.innerHTML = `
    <div class="photo-modal">
      <div class="photo-title">ФАСАДЫ</div>
      <div class="small">Есть ли фасады которые изготавливаются на нашем производстве?</div>
      <div class="photo-actions" style="margin-top:12px;">
        <button id="facadesYes">ЕСТЬ</button>
        <button id="facadesNo">НЕТ</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('facadesYes').onclick = () => { overlay.remove(); onChoose(true); };
  document.getElementById('facadesNo').onclick = () => { overlay.remove(); onChoose(false); };
}

function openPhotoDialog(stage, color, btn) {
  const overlay = document.createElement('div');
  overlay.id = 'photoOverlay';
  overlay.innerHTML = `
    <div class="photo-modal">
      <div class="photo-title">Загрузите фото для этапа</div>
      <input id="photoInput" type="file" accept="image/*" multiple />
      <div class="photo-actions">
        <button id="photoUpload">Загрузить</button>
        <button id="photoSkip">Продолжить без фото</button>
        <button id="photoCancel">Отмена</button>
      </div>
      <div id="photoMsg" class="small"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input = document.getElementById('photoInput');
  const msgEl = document.getElementById('photoMsg');

  document.getElementById('photoCancel').onclick = () => overlay.remove();
  document.getElementById('photoSkip').onclick = () => {
    overlay.remove();
    if (stage === 'prisadka') {
      openFacadesDialog(hasFacades => sendStage(stage, color, btn, '', hasFacades));
    } else {
      sendStage(stage, color, btn, '');
    }
  };
  document.getElementById('photoUpload').onclick = async () => {
    const files = Array.from(input.files || []);
    if (!files.length) { msgEl.textContent = 'Выберите фото'; return; }
    msgEl.textContent = 'Загрузка...';
    const folderUrl = await uploadPhotos(files, stage).catch(err => { msgEl.textContent = err; return null; });
    if (folderUrl) {
      overlay.remove();
      if (stage === 'prisadka') {
        openFacadesDialog(hasFacades => sendStage(stage, color, btn, folderUrl, hasFacades));
      } else {
        sendStage(stage, color, btn, folderUrl);
      }
    }
  };
}

async function uploadPhotos(files, stage) {
  const parsed = parseDbOrderClient(orderInput.value);
  const order = parsed.order;
  const db = parsed.db;
  const name = workerInput.value.trim();
  if (!order || !name) throw 'Введите заказ и имя';

  const now = new Date();
  const date = now.toLocaleDateString('ru-RU');
  const time = now.toTimeString().slice(0,5);

  const payload = { action: 'upload_photos', order, stage, name, date, time, db, files: [] };
  for (const f of files) {
    const item = await fileToPayload(f);
    payload.files.push(item);
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  }).then(r => r.json());

  if (!res.ok) throw (res.msg || 'Ошибка загрузки');
  return res.folderUrl;
}

async function fileToPayload(file) {
  const MAX_SIZE = 1600;
  const QUALITY = 0.8;
  try {
    const img = await loadImage(file);
    let w = img.width, h = img.height;
    if (Math.max(w, h) > MAX_SIZE) {
      if (w >= h) { h = Math.round(h * (MAX_SIZE / w)); w = MAX_SIZE; }
      else { w = Math.round(w * (MAX_SIZE / h)); h = MAX_SIZE; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const cctx = canvas.getContext('2d');
    cctx.drawImage(img, 0, 0, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', QUALITY);
    const data = await blobToBase64(blob);
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    return { name: baseName + '.jpg', type: 'image/jpeg', data };
  } catch (e) {
    const data = await fileToBase64(file);
    return { name: file.name, type: file.type, data };
  }
}
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject('Ошибка загрузки изображения'); };
    img.src = url;
  });
}
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => { if (!b) reject('Ошибка сжатия'); resolve(b); }, type, quality);
  });
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = () => reject('Ошибка чтения');
    r.readAsDataURL(blob);
  });
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = () => reject('Ошибка чтения файла');
    r.readAsDataURL(file);
  });
}

function setActiveFilter(filter) {
  document.querySelectorAll('.filters button').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
}

// ========== Работа с отчётами (пагинация + кэш) ==========
function loadReportsPaged(filter, pageNum = 1, perPageNum = 200) {
  return new Promise((resolve, reject) => {
    callApiJsonp({
      action: 'reports_paged',
      filter,
      page: pageNum,
      per_page: perPageNum
    }, resolve, reject);
  });
}

async function loadAllReports(filter, onProgress = null) {
  let allData = [];
  let page = 1;
  let total = 0;
  do {
    const result = await loadReportsPaged(filter, page, 200);
    if (!result.ok) throw new Error(result.msg);
    allData = allData.concat(result.data);
    total = result.total;
    if (onProgress) onProgress(allData.length, total);
    page++;
  } while (allData.length < total);
  return allData;
}

async function loadReportsWithCache(filter, forceRefresh = false) {
  const cacheKey = `reports_${filter}`;
  if (!forceRefresh) {
    const cached = await loadReportsFromDB(cacheKey);
    if (cached && cached.data && cached.data.length) {
      rawReports = cached.data;
      applyFilterSort(false);
      reportsStatus.textContent = `Найдено: ${currentReports.length} (кэш, фильтр: ${filter})`;
      return;
    }
  }
  reportsStatus.textContent = 'Загрузка данных с сервера...';
  try {
    const allData = await loadAllReports(filter, (loaded, total) => {
      reportsStatus.textContent = `Загрузка: ${loaded}/${total}`;
    });
    rawReports = allData;
    await saveReportsToDB(cacheKey, rawReports);
    applyFilterSort(false);
    reportsStatus.textContent = `Найдено: ${currentReports.length} (обновлено, фильтр: ${filter})`;
  } catch (err) {
    reportsStatus.textContent = `⚠️ Ошибка: ${err.message}`;
    console.error(err);
  }
}

function openReports() {
  mainView.classList.add('hidden');
  reportsView.classList.remove('hidden');
  const savedFilter = localStorage.getItem('lastReportsFilter');
  if (savedFilter && ['day', 'week', 'month', 'all'].includes(savedFilter)) {
    currentFilter = savedFilter;
  } else {
    currentFilter = 'day';
  }
  setActiveFilter(currentFilter);
  const cacheKey = `reports_${currentFilter}`;
  loadReportsFromDB(cacheKey).then(cached => {
    if (cached && cached.data && cached.data.length) {
      rawReports = cached.data;
      applyFilterSort(false);
      reportsStatus.textContent = `Найдено: ${currentReports.length} (кэш, фильтр: ${currentFilter})`;
    } else {
      reportsTableBody.innerHTML = '';
      reportsStatus.textContent = 'Загрузка данных с сервера...';
    }
  }).catch(console.error);
  loadReportsWithCache(currentFilter, true);
  if (reportsTimer) clearInterval(reportsTimer);
  reportsTimer = setInterval(() => loadReportsWithCache(currentFilter, true), 60000);
}

function closeReports() {
  reportsView.classList.add('hidden');
  mainView.classList.remove('hidden');
  if (reportsTimer) clearInterval(reportsTimer);
}
if (view === 'reports') setTimeout(openReports, 0);

function applyFilterSort(resetPage) {
  currentReports = rawReports.slice().filter(r => !deletedTombstones.has(reportId(r)));
  const t = filterTerm.trim().toLowerCase();
  if (t) {
    const words = t.split(/\s+/);
    currentReports = currentReports.filter(r => {
      const line = (r.order + r.date + r.time + r.stage + r.name + r.db).toLowerCase();
      return words.some(w => line.includes(w));
    });
  }
  currentReports.sort((a, b) => compareReports(a, b, sortMode));
  const pages = Math.max(1, Math.ceil(currentReports.length / perPage));
  if (resetPage) page = 1;
  if (page > pages) page = pages;
  reportsStatus.textContent = `Найдено: ${currentReports.length}` + (t ? ` | Поиск: ${t}` : '');
  renderReports();
  renderPager();
}

function compareReports(a, b, mode) {
  const av = mode.includes('order') ? (a.order || '') : mode.includes('db') ? (a.db || '') : (a.ts || 0);
  const bv = mode.includes('order') ? (b.order || '') : mode.includes('db') ? (b.db || '') : (b.ts || 0);
  const asc = mode.includes('_asc');
  if (typeof av === 'number') return asc ? av - bv : bv - av;
  const s1 = String(av).toLowerCase(), s2 = String(bv).toLowerCase();
  if (s1 < s2) return asc ? -1 : 1;
  if (s1 > s2) return asc ? 1 : -1;
  return 0;
}

function renderReports() {
  reportsTableBody.innerHTML = '';
  const start = (page - 1) * perPage;
  const slice = currentReports.slice(start, start + perPage);
  slice.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.order)}</td>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.time)}</td>
      <td>${escapeHtml(stageNamesRu[r.stage] || r.stage)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.db || '')}</td>
      <td class="row-actions">${editMode ? '<button>Удалить</button>' : ''}</td>
    `;
    if (editMode) {
      const btn = tr.querySelector('button');
      const key = reportId(r);
      btn.onclick = () => {
        if (!confirm('Удалить строку?')) return;
        callApiJsonp({ action: 'delete_report', db: r.db, row: r.row }, res => {
          if (!res.ok) { reportsStatus.textContent = '⚠️ ' + res.msg; return; }
          deletedTombstones.set(key, Date.now());
          rawReports = rawReports.filter(x => reportId(x) !== key);
          currentReports = currentReports.filter(x => reportId(x) !== key);
          applyFilterSort(false);
          reportsStatus.textContent = '✅ Удалено';
        });
      };
    }
    reportsTableBody.appendChild(tr);
  });
}

function renderPager() {
  if (!pager) return;
  pager.innerHTML = '';
  const total = currentReports.length;
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return;
  const prev = document.createElement('button');
  prev.textContent = '←';
  prev.disabled = page <= 1;
  prev.onclick = () => { page--; renderReports(); renderPager(); };
  pager.appendChild(prev);
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.textContent = i;
    if (i === page) b.classList.add('active');
    b.onclick = () => { page = i; renderReports(); renderPager(); };
    pager.appendChild(b);
  }
  const next = document.createElement('button');
  next.textContent = '→';
  next.disabled = page >= pages;
  next.onclick = () => { page++; renderReports(); renderPager(); };
  pager.appendChild(next);
}

document.querySelectorAll('.filters button').forEach(btn => {
  btn.onclick = () => {
    const f = btn.dataset.filter;
    if (!f) return;
    currentFilter = f;
    setActiveFilter(f);
    localStorage.setItem('lastReportsFilter', f);
    loadReportsWithCache(f, true);
    if (reportsTimer) clearInterval(reportsTimer);
    reportsTimer = setInterval(() => loadReportsWithCache(currentFilter, true), 60000);
    page = 1;
  };
});

searchInput.addEventListener('input', () => {
  filterTerm = searchInput.value;
  applyFilterSort(true);
});
sortSelect.onchange = () => {
  sortMode = sortSelect.value;
  applyFilterSort(true);
};

statsBtn.onclick = () => {
  const d = statsDate.value, stage = statsStage.value;
  if (!d) { statsResult.textContent = 'Выберите дату'; return; }
  statsResult.textContent = 'Считаю...';
  callApiJsonp({ action: 'reports', filter: 'all' }, res => {
    if (!res.ok) { statsResult.textContent = 'Ошибка'; return; }
    const [year, month, day] = d.split('-');
    const datePrefix = `${day}.${month}.${year.slice(-2)}`;
    const cnt = new Set((res.data || [])
      .filter(r => r.date.startsWith(datePrefix) && (stage === 'all' || r.stage === stage))
      .map(r => r.order)).size;
    statsResult.textContent = 'Уникальных заказов: ' + cnt;
  }, () => statsResult.textContent = 'Нет ответа');
};

function parseYmdToMs(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-');
  return new Date(parseInt(y), parseInt(m)-1, parseInt(d), 0, 0, 0).getTime();
}
function escapeHtml(str) { return String(str).replace(/[&<>]/g, function(m){if(m==='&')return'&amp;';if(m==='<')return'&lt;';if(m==='>')return'&gt;';return m;}); }
async function loadImageAsDataURL(url) {
  const res = await fetch(url, { mode: 'cors' });
  const blob = await res.blob();
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}
function buildSummary(data) {
  const map = new Map();
  data.forEach(r => {
    const key = `${r.stage}|${r.date}|${r.name}`;
    if (!map.has(key)) map.set(key, { stage: r.stage, date: r.date, name: r.name, orders: new Set() });
    map.get(key).orders.add(r.order);
  });
  const rows = Array.from(map.values()).map(x => ({
    stage: stageNamesRu[x.stage] || x.stage,
    date: x.date,
    name: x.name,
    count: x.orders.size,
    orders: Array.from(x.orders).join(', ')
  }));
  rows.sort((a,b) => a.date.localeCompare(b.date) || a.stage.localeCompare(b.stage) || a.name.localeCompare(b.name));
  return rows;
}

exportPdfBtn.onclick = async () => {
  const fromMs = parseYmdToMs(pdfFrom.value);
  const toMs = parseYmdToMs(pdfTo.value);
  const toEnd = toMs ? toMs + 24*60*60*1000 - 1 : null;
  let data = rawReports.slice();
  if (fromMs) data = data.filter(r => r.ts >= fromMs);
  if (toEnd) data = data.filter(r => r.ts <= toEnd);
  if (!data.length) { alert("Нет данных"); return; }
  const summaryRows = buildSummary(data);
  const period = (pdfFrom.value||'') + (pdfTo.value ? ' — '+pdfTo.value : '');
  const logoUrl = "https://s.fstl.ai/workers/nano/image_1770296525645_6vc4s2.png";
  const logoData = await loadImageAsDataURL(logoUrl).catch(()=>'');
  const rowsHtml = data.map(r => `<tr><td>${escapeHtml(r.order)}</td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.time)}</td><td>${escapeHtml(stageNamesRu[r.stage]||r.stage)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.db||'')}</td></tr>`).join('');
  printArea.innerHTML = `
    <div style="width:794px; padding:28px; font-family:Arial; box-sizing:border-box;">
      <div style="display:flex; align-items:center; gap:14px;">
        ${logoData ? `<img src="${logoData}" style="width:320px;height:auto;">` : ''}
        <div><div style="font-size:20px;font-weight:700;">Отчёт ${period ? '('+period+')' : ''}</div><div style="font-size:12px;">Сформировано: ${new Date().toLocaleString()}</div></div>
      </div>
      <div style="margin-top:12px;"><strong>Сводка по сотрудникам:</strong></div>
      <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:11px;"><thead><tr><th style="border:1px solid #bbb;padding:6px;">Этап</th><th style="border:1px solid #bbb;padding:6px;">Дата</th><th style="border:1px solid #bbb;padding:6px;">Сотрудник</th><th style="border:1px solid #bbb;padding:6px;">Кол-во</th><th style="border:1px solid #bbb;padding:6px;">Заказы</th></tr></thead><tbody>${summaryRows.map(s => `<tr><td>${escapeHtml(s.stage)}</td><td>${escapeHtml(s.date)}</td><td>${escapeHtml(s.name)}</td><td>${s.count}</td><td>${escapeHtml(s.orders)}</td></tr>`).join('')}</tbody></table>
      <table style="width:100%;border-collapse:collapse;margin-top:14px;"><thead><tr><th>Заказ</th><th>Дата</th><th>Время</th><th>Этап</th><th>Сотрудник</th><th>Таблица</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    </div>`;
  const fullCanvas = await html2canvas(printArea, { scale: 2, useCORS: true, backgroundColor: '#fff' });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = 210, pageHeight = 297;
  const pageHeightPx = Math.floor(fullCanvas.width * (pageHeight / pageWidth));
  let y = 0, pageIndex = 0;
  while (y < fullCanvas.height) {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = fullCanvas.width;
    pageCanvas.height = Math.min(pageHeightPx, fullCanvas.height - y);
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,pageCanvas.width,pageCanvas.height);
    ctx.drawImage(fullCanvas, 0, y, pageCanvas.width, pageCanvas.height, 0, 0, pageCanvas.width, pageCanvas.height);
    const imgData = pageCanvas.toDataURL('image/png');
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, (pageCanvas.height / pageCanvas.width) * pageWidth);
    y += pageHeightPx;
    pageIndex++;
  }
  pdf.save('reports.pdf');
};

openReportsBtn.onclick = openReports;
closeReportsBtn.onclick = closeReports;
if (openPhotoStoreBtn) openPhotoStoreBtn.onclick = () => window.open(PHOTO_ROOT_URL, '_blank');
editReportsBtn.onclick = () => {
  const p = prompt('Пароль:');
  if (p === EDIT_PASS) { editMode = !editMode; editReportsBtn.textContent = editMode ? 'Выход' : 'Редактировать'; renderReports(); }
  else alert('Неверный пароль');
};
document.getElementById('refreshBtn').onclick = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach(r => r.unregister());
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    const database = await initDB();
    const tx = database.transaction([STORE_NAME], 'readwrite');
    await tx.objectStore(STORE_NAME).clear();
  } catch(e) {}
  location.href = location.href.split('?')[0] + '?hard=' + Date.now();
};

// PWA автообновление
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update();
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller && !sessionStorage.getItem('sw-reloaded')) {
            sessionStorage.setItem('sw-reloaded', '1');
            location.reload();
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!sessionStorage.getItem('sw-reloaded')) {
          sessionStorage.setItem('sw-reloaded', '1');
          location.reload();
        }
      });
    } catch(e) {}
  });
}

// IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = reject;
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
  });
}
async function saveReportsToDB(key, reports) {
  const database = await initDB();
  const tx = database.transaction([STORE_NAME], 'readwrite');
  await tx.objectStore(STORE_NAME).put({ id: key, data: reports, timestamp: Date.now() });
}
async function loadReportsFromDB(key) {
  const database = await initDB();
  const tx = database.transaction([STORE_NAME], 'readonly');
  return new Promise(resolve => {
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

// Сбор ЗП
function addSalaryButton() {
  const editBtn = document.getElementById('editReports');
  if (!editBtn || document.getElementById('salaryBtn')) return;
  const salaryBtn = document.createElement('button');
  salaryBtn.id = 'salaryBtn';
  salaryBtn.textContent = 'СБОР ЗП';
  salaryBtn.onclick = openSalaryDialog;
  editBtn.insertAdjacentElement('afterend', salaryBtn);
}
function openSalaryDialog() { showSalaryModal(); }
function showSalaryModal() {
  let workersList = [];
  if (rawReports && rawReports.length) {
    workersList = [...new Set(rawReports.map(r => r.name).filter(Boolean))].sort();
  }
  const overlay = document.createElement('div');
  overlay.id = 'salaryOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-title">Сбор ЗП</div>
      <div id="workersLoading" class="small" ${workersList.length ? 'style="display:none;"' : ''}>Загрузка списка сотрудников...</div>
      <div id="workersCheckboxesContainer" style="display:${workersList.length ? 'block' : 'none'};">
        <label class="select-all"><input type="checkbox" id="selectAllWorkers"> Выбрать всех</label>
        <div id="workersCheckboxes">${workersList.map(w => `<label><input type="checkbox" value="${escapeHtml(w)}"> ${escapeHtml(w)}</label>`).join('')}</div>
      </div>
      <div class="date-range"><label>Период с: <input type="date" id="salaryDateFrom"></label><label>по: <input type="date" id="salaryDateTo"></label></div>
      <div class="modal-actions"><button id="salaryExportBtn" ${workersList.length ? '' : 'disabled'}>Экспорт Excel</button><button id="salaryCancelBtn">Отмена</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const loadingDiv = document.getElementById('workersLoading'), container = document.getElementById('workersCheckboxesContainer'), exportBtn = document.getElementById('salaryExportBtn'), cancelBtn = document.getElementById('salaryCancelBtn');
  cancelBtn.onclick = () => overlay.remove();
  if (workersList.length) {
    const selectAll = document.getElementById('selectAllWorkers'), checkboxes = container.querySelectorAll('#workersCheckboxes input');
    selectAll.onchange = () => checkboxes.forEach(cb => cb.checked = selectAll.checked);
    exportBtn.disabled = false;
    exportBtn.onclick = async () => {
      const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
      if (!selected.length) { alert('Выберите сотрудников'); return; }
      const fromStr = document.getElementById('salaryDateFrom').value, toStr = document.getElementById('salaryDateTo').value;
      if (!fromStr || !toStr) { alert('Укажите период'); return; }
      const fromDate = new Date(fromStr + 'T00:00:00'), toDate = new Date(toStr + 'T23:59:59');
      if (isNaN(fromDate) || isNaN(toDate)) { alert('Некорректная дата'); return; }
      exportBtn.disabled = true; exportBtn.textContent = 'Загрузка...';
      try { await exportSalaryToExcel(selected, fromDate.getTime(), toDate.getTime()); } catch(e) { alert('Ошибка: '+e.message); } finally { exportBtn.disabled = false; exportBtn.textContent = 'Экспорт Excel'; }
    };
  } else {
    callApiJsonp({ action: 'reports', filter: 'all' }, res => {
      if (!res.ok) { loadingDiv.textContent = 'Ошибка загрузки'; return; }
      const workers = [...new Set((res.data||[]).map(r => r.name).filter(Boolean))].sort();
      if (!workers.length) { loadingDiv.textContent = 'Нет данных о сотрудниках'; return; }
      loadingDiv.style.display = 'none'; container.style.display = 'block';
      container.innerHTML = `<label class="select-all"><input type="checkbox" id="selectAllWorkers"> Выбрать всех</label><div id="workersCheckboxes">${workers.map(w => `<label><input type="checkbox" value="${escapeHtml(w)}"> ${escapeHtml(w)}</label>`).join('')}</div>`;
      const selectAll = document.getElementById('selectAllWorkers'), checkboxes = container.querySelectorAll('#workersCheckboxes input');
      selectAll.onchange = () => checkboxes.forEach(cb => cb.checked = selectAll.checked);
      exportBtn.disabled = false;
      exportBtn.onclick = async () => {
        const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
        if (!selected.length) { alert('Выберите сотрудников'); return; }
        const fromStr = document.getElementById('salaryDateFrom').value, toStr = document.getElementById('salaryDateTo').value;
        if (!fromStr || !toStr) { alert('Укажите период'); return; }
        const fromDate = new Date(fromStr + 'T00:00:00'), toDate = new Date(toStr + 'T23:59:59');
        if (isNaN(fromDate) || isNaN(toDate)) { alert('Некорректная дата'); return; }
        exportBtn.disabled = true; exportBtn.textContent = 'Загрузка...';
        try { await exportSalaryToExcel(selected, fromDate.getTime(), toDate.getTime()); } catch(e) { alert('Ошибка: '+e.message); } finally { exportBtn.disabled = false; exportBtn.textContent = 'Экспорт Excel'; }
      };
    });
  }
}
async function exportSalaryToExcel(selectedNames, fromTs, toTs) {
  return new Promise((resolve, reject) => {
    callApiJsonp({ action: 'reports', filter: 'date_range', from: fromTs, to: toTs }, res => {
      if (!res.ok) reject(new Error(res.msg));
      const data = (res.data||[]).filter(r => selectedNames.includes(r.name));
      if (!data.length) { alert('Нет данных'); resolve(); return; }
      const groups = new Map();
      data.forEach(r => {
        const key = `${r.name}|${r.stage}`;
        if (!groups.has(key)) groups.set(key, { orders: [], count: 0 });
        const g = groups.get(key);
        if (!g.orders.includes(r.order)) { g.orders.push(r.order); g.count++; }
      });
      const sorted = [...groups.keys()].sort((a,b) => a.localeCompare(b));
      let maxOrders = 0;
      for (const k of sorted) maxOrders = Math.max(maxOrders, groups.get(k).orders.length);
      const now = new Date();
      const periodStr = `${new Date(fromTs).toLocaleDateString()} – ${new Date(toTs).toLocaleDateString()}`;
      let html = `<html><head><meta charset="UTF-8"><title>Сбор ЗП ${periodStr}</title><style>body{font-family:Arial;margin:20px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #000;padding:8px;text-align:center;vertical-align:top;} th{background:#f2f2f2;} td:first-child,th:first-child{text-align:left;}</style></head><body><div><strong>Дата формирования:</strong> ${now.toLocaleString()}<br><strong>Период:</strong> ${periodStr}</div><table><thead><tr><th>Сотрудник</th><th>Этап</th><th>Количество</th>${Array(maxOrders).fill().map((_,i)=>`<th>Заказ ${i+1}</th>`).join('')}</tr></thead><tbody>`;
      for (const key of sorted) {
        const [name, stage] = key.split('|');
        const g = groups.get(key);
        const orders = [...g.orders];
        while (orders.length < maxOrders) orders.push('');
        html += `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(stageNamesRu[stage]||stage)}</td><td>${g.count}</td>${orders.map(o=>`<td>${escapeHtml(o)}</td>`).join('')}</tr>`;
      }
      html += `</tbody></table></body></html>`;
      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `zarplata_${now.toISOString().slice(0,10)}.xls`;
      link.click();
      URL.revokeObjectURL(url);
      resolve();
    }, reject);
  });
}

document.addEventListener('DOMContentLoaded', addSalaryButton);
initDB().catch(console.error);
