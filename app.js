const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec';
const EDIT_PASS = '1990';
const PHOTO_ROOT_URL = 'https://drive.google.com/drive/folders/1zk8c6qGUBNcVQAUlucU5cedBKIQNu5GZ';
const photoStages = new Set(['hdf', 'prisadka', 'upakovka']);

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
    return [
        String(r.db || ''),
        String(r.order || ''),
        String(r.stage || ''),
        String(r.name || ''),
        String(r.ts || ''),
        String(r.date || ''),
        String(r.time || '')
    ].join('|');
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
function stopCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } showScanButton(true); }
function freezeCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); locked = true; if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } showScanButton(true); }

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

async function startCamera() {
    if (starting) return;
    starting = true;
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
    }
    finally { starting = false; }
}
startBtn.addEventListener("click", startCamera);

function callApi(params, cb, onError) {
    const cbName = 'cb_' + Math.random().toString(36).slice(2);
    let done = false;
    window[cbName] = function () { };
    const timeout = setTimeout(() => { if (!done) { done = true; if (onError) onError("⚠️ Нет ответа от сервера"); } }, 12000);
    window[cbName] = function (res) {
        if (done) return;
        done = true; clearTimeout(timeout); cb(res);
        setTimeout(() => { delete window[cbName]; }, 30000);
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

function sendStage(stage, color, btn, photoUrl, packagingCount) {
    const parsed = parseDbOrderClient(orderInput.value);
    let raw = parsed.order;
    let db = parsed.db;
    let name = workerInput.value.trim();

    if (!raw) {
        statusEl.innerHTML = "Введите/сканируйте номер";
        return;
    }
    if (!name) {
        statusEl.innerHTML = "Введите имя";
        return;
    }
    if (btn) flashStage(btn);
    statusEl.innerHTML = "Отправка...";

    callApi({
        action: 'mark',
        stage,
        order: raw,
        name,
        color: color || '',
        db: db,
        photo_url: photoUrl || '',
        facades: '',
        packaging_count: packagingCount || ''
    },
        res => {
            statusEl.innerHTML = res.ok ? "✅ Готово" : "⚠️ " + res.msg;
        },
        err => {
            statusEl.innerHTML = err;
        }
    );
}

const hasBarcodeDetector = ('BarcodeDetector' in window);
const detector = hasBarcodeDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;

function scan() {
    if (locked) return;
    if (!isStreamActive()) { startCamera(); return; }

    if (hasBarcodeDetector) {
        detector.detect(video).then(codes => {
            if (codes && codes.length) {
                const data = codes[0].rawValue || '';
                orderInput.value = data;
                msg.innerHTML = "✅ Готово!";
                if (navigator.vibrate) navigator.vibrate(80);
                showScanOverlay(data);
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
            freezeCamera(); return;
        }
    }
    requestAnimationFrame(scan);
}

const params = new URLSearchParams(location.search);
const only = (params.get('only') || '').toLowerCase();
const view = (params.get('view') || '').toLowerCase();

document.querySelectorAll('#stageButtons button').forEach(btn => {
    const stage = btn.dataset.stage;
    const key = (btn.dataset.only || stage).toLowerCase();
    const color = btn.dataset.color || '';
    btn.onclick = () => {
        const params = new URLSearchParams(location.search);
        const only = (params.get('only') || '').toLowerCase();

        if (only === 'upakovka' && stage === 'upakovka') {
            openPackagingDialog(stage, color, btn);
        } else if (photoStages.has(stage)) {
            openPhotoDialog(stage, color, btn);
        } else {
            sendStage(stage, color, btn, '');
        }
    };
    if (only && key !== only) btn.style.display = 'none';
});
if (only) stageTitle.textContent = "Этап:";

function openPackagingDialog(stage, color, btn) {
    const overlay = document.createElement('div');
    overlay.id = 'packagingOverlay';
    overlay.innerHTML = `
        <div class="photo-modal" style="max-width: 400px;">
            <div class="photo-title">УПАКОВКА</div>
            <div style="margin: 16px 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <span style="font-size: 18px; font-weight: 600;">Количество упаковок:</span>
                <input type="number" id="packagingCount" min="1" value="1" style="width: 80px; font-size: 18px; text-align: center; margin: 0;">
            </div>
            <div class="small" style="margin-bottom: 12px;">
                <a href="https://drive.google.com/drive/folders/1zk8c6qGUBNcVQAUlucU5cedBKIQNu5GZ" target="_blank" style="color: var(--gold-hi);">📷 Загрузить фотографии</a>
            </div>
            <div class="photo-actions" style="justify-content: space-between;">
                <button id="packagingWithoutPhoto" style="width: auto;">Без фото</button>
                <button id="packagingWithPhoto" style="width: auto; background: var(--gold); color: #000;">С фото</button>
                <button id="packagingCancel" style="width: auto;">Отмена</button>
            </div>
            <div id="packagingMsg" class="small" style="margin-top: 12px;"></div>
        </div>`;
    document.body.appendChild(overlay);

    const msgEl = document.getElementById('packagingMsg');
    const countInput = document.getElementById('packagingCount');

    document.getElementById('packagingCancel').onclick = () => overlay.remove();

    document.getElementById('packagingWithoutPhoto').onclick = () => {
        const count = countInput.value.trim();
        if (!count || parseInt(count) < 1) {
            msgEl.textContent = 'Введите корректное количество';
            return;
        }
        overlay.remove();
        sendStage(stage, color, btn, '', count);
    };

    document.getElementById('packagingWithPhoto').onclick = async () => {
        const count = countInput.value.trim();
        if (!count || parseInt(count) < 1) {
            msgEl.textContent = 'Введите корректное количество';
            return;
        }

        const photoOverlay = document.createElement('div');
        photoOverlay.id = 'tempPhotoOverlay';
        photoOverlay.innerHTML = `
            <div class="photo-modal">
                <div class="photo-title">Загрузите фото для упаковки</div>
                <input id="tempPhotoInput" type="file" accept="image/*" multiple />
                <div class="photo-actions">
                    <button id="tempPhotoUpload">Загрузить</button>
                    <button id="tempPhotoCancel">Отмена</button>
                </div>
                <div id="tempPhotoMsg" class="small"></div>
            </div>`;
        document.body.appendChild(photoOverlay);

        const tempInput = document.getElementById('tempPhotoInput');
        const tempMsg = document.getElementById('tempPhotoMsg');

        document.getElementById('tempPhotoCancel').onclick = () => {
            photoOverlay.remove();
            document.body.appendChild(overlay);
        };

        document.getElementById('tempPhotoUpload').onclick = async () => {
            const files = Array.from(tempInput.files || []);
            if (!files.length) {
                tempMsg.textContent = 'Выберите фото';
                return;
            }

            tempMsg.textContent = 'Загрузка...';
            const folderUrl = await uploadPhotos(files, stage).catch(err => {
                tempMsg.textContent = err;
                return null;
            });

            if (folderUrl) {
                photoOverlay.remove();
                overlay.remove();
                sendStage(stage, color, btn, folderUrl, count);
            }
        };
    };
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
            openFacadesDialog((hasFacades) => {
                sendStage(stage, color, btn, '', hasFacades);
            });
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
                openFacadesDialog((hasFacades) => {
                    sendStage(stage, color, btn, folderUrl, hasFacades);
                });
            } else {
                sendStage(stage, color, btn, folderUrl);
            }
        }
    };
}

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
            <div id="facadesMsg" class="small"></div>
        </div>`;
    document.body.appendChild(overlay);

    document.getElementById('facadesYes').onclick = () => {
        overlay.remove();
        onChoose(true);
    };
    document.getElementById('facadesNo').onclick = () => {
        overlay.remove();
        onChoose(false);
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
    const time = now.toTimeString().slice(0, 5);

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
            if (w >= h) {
                h = Math.round(h * (MAX_SIZE / w));
                w = MAX_SIZE;
            } else {
                w = Math.round(w * (MAX_SIZE / h));
                h = MAX_SIZE;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
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
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject('Ошибка загрузки изображения');
        };
        img.src = url;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(b => {
            if (!b) return reject('Ошибка сжатия');
            resolve(b);
        }, type, quality);
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

function openReports() {
    mainView.classList.add('hidden');
    reportsView.classList.remove('hidden');

    if (!currentFilter) currentFilter = 'day';
    setActiveFilter(currentFilter);
    loadReports(currentFilter, true);

    if (reportsTimer) clearInterval(reportsTimer);
    reportsTimer = setInterval(() => { loadReports(currentFilter); }, 7000);
}
function closeReports() {
    reportsView.classList.add('hidden');
    mainView.classList.remove('hidden');
    if (reportsTimer) { clearInterval(reportsTimer); reportsTimer = null; }
}
if (view === 'reports') { setTimeout(openReports, 0); }

function loadReports(filter, force) {
    if (!force && reportsLoading) return;
    reportsLoading = true;
    currentFilter = filter;

    const reqId = ++reportsReqId;

    callApi({ action: 'reports', filter }, res => {
        if (reqId !== reportsReqId) return;
        reportsLoading = false;
        if (!res.ok) { reportsStatus.textContent = '⚠️ ' + res.msg; return; }
        rawReports = res.data || [];
        applyFilterSort(false);
    }, err => {
        if (reqId !== reportsReqId) return;
        reportsLoading = false;
    });
}

function applyFilterSort(resetPage) {
    currentReports = rawReports.slice().filter(r => {
        const id = reportId(r);
        return !deletedTombstones.has(id);
    });

    const t = (filterTerm || '').toLowerCase().trim();
    if (t) {
        const words = t.split(/\s+/).filter(Boolean);
        currentReports = currentReports.filter(r => {
            const line = (r.order + ' ' + r.date + ' ' + r.time + ' ' + r.stage + ' ' + r.name + ' ' + r.db).toLowerCase();
            for (let i = 0; i < words.length; i++) { if (line.indexOf(words[i]) !== -1) return true; }
            return false;
        });
    }
    currentReports.sort((a, b) => compareReports(a, b, sortMode));

    const pages = Math.max(1, Math.ceil(currentReports.length / perPage));
    if (resetPage) page = 1;
    if (page > pages) page = pages;

    reportsStatus.textContent = 'Найдено: ' + currentReports.length + (t ? (' | Поиск: ' + t) : '');
    renderReports();
    renderPager();
}

function compareReports(a, b, mode) {
    const av = (mode.indexOf('order') === 0) ? (a.order || '') :
        (mode.indexOf('db') === 0) ? (a.db || '') :
            (mode.indexOf('date') === 0) ? (a.ts || 0) :
                (mode.indexOf('time') === 0) ? (a.ts || 0) : '';
    const bv = (mode.indexOf('order') === 0) ? (b.order || '') :
        (mode.indexOf('db') === 0) ? (b.db || '') :
            (mode.indexOf('date') === 0) ? (b.ts || 0) :
                (mode.indexOf('time') === 0) ? (b.ts || 0) : '';
    const asc = mode.indexOf('_asc') !== -1;
    if (typeof av === 'number') return asc ? (av - bv) : (bv - av);
    const s1 = String(av).toLowerCase(), s2 = String(bv).toLowerCase();
    if (s1 < s2) return asc ? -1 : 1;
    if (s1 > s2) return asc ? 1 : -1;
    return 0;
}

function renderReports() {
    reportsTableBody.innerHTML = '';

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const slice = currentReports.slice(start, end);

    slice.forEach(r => {
        const tr = document.createElement('tr');
        const orderTd = document.createElement('td');
        const dateTd = document.createElement('td');
        const timeTd = document.createElement('td');
        const stageTd = document.createElement('td');
        const nameTd = document.createElement('td');
        const dbTd = document.createElement('td');
        const actionTd = document.createElement('td');
        orderTd.textContent = r.order; dateTd.textContent = r.date; timeTd.textContent = r.time;
        stageTd.textContent = r.stage; nameTd.textContent = r.name; dbTd.textContent = r.db || '';

        if (editMode) {
            const btn = document.createElement('button');
            btn.textContent = 'Удалить';
            actionTd.classList.add('row-actions'); actionTd.appendChild(btn);

            const key = reportId(r);
            btn.onclick = () => {
                if (!confirm('Удалить строку?')) return;
                callApi({ action: 'delete_report', db: r.db, row: r.row }, res => {
                    if (!res.ok) { reportsStatus.textContent = '⚠️ ' + res.msg; return; }
                    deletedTombstones.set(key, Date.now());
                    rawReports = rawReports.filter(x => reportId(x) !== key);
                    currentReports = currentReports.filter(x => reportId(x) !== key);
                    applyFilterSort(false);
                    reportsStatus.textContent = '✅ Удалено';
                }, () => { });
            };
        }
        tr.append(orderTd, dateTd, timeTd, stageTd, nameTd, dbTd, actionTd);
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
        currentFilter = f;
        setActiveFilter(f);
        loadReports(f, true);
        if (reportsTimer) clearInterval(reportsTimer);
        reportsTimer = setInterval(() => { loadReports(currentFilter); }, 7000);
        page = 1;
    };
});

searchInput.addEventListener('input', () => {
    filterTerm = searchInput.value.trim();
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
    callApi({ action: 'reports', filter: 'all' }, res => {
        if (!res.ok) { statsResult.textContent = 'Ошибка'; return; }
        const prefix = d.split('-'); if (prefix.length !== 3) { statsResult.textContent = 'Ошибка даты'; return; }
        const datePrefix = prefix[2] + '.' + prefix[1] + '.' + prefix[0].slice(-2);
        const cnt = new Set((res.data || []).filter(r => String(r.date || '').startsWith(datePrefix) && (stage === 'all' || String(r.stage || '').toLowerCase() === stage)).map(r => String(r.order || '').trim())).size;
        statsResult.textContent = 'Уникальных заказов: ' + cnt;
    }, () => { statsResult.textContent = 'Нет ответа'; });
};

function parseYmdToMs(ymd) {
    if (!ymd) return '';
    const p = ymd.split('-'); if (p.length !== 3) return '';
    const y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
    return new Date(y, m - 1, d, 0, 0, 0).getTime();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadImageAsDataURL(url) {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

function buildSummary(data) {
    const map = new Map();

    data.forEach(r => {
        const stage = String(r.stage || '').trim();
        const date = String(r.date || '').trim();
        const name = String(r.name || '').trim();
        if (!stage || !date || !name) return;

        const key = stage + '|' + date + '|' + name;
        if (!map.has(key)) {
            map.set(key, { stage, date, name, orders: new Set() });
        }
        const order = String(r.order || '').trim();
        if (order) map.get(key).orders.add(order);
    });

    const rows = Array.from(map.values()).map(x => ({
        stage: x.stage,
        date: x.date,
        name: x.name,
        count: x.orders.size,
        orders: Array.from(x.orders).join(', ')
    }));

    rows.sort((a, b) => {
        const d = a.date.localeCompare(b.date, 'ru');
        if (d !== 0) return d;
        const s = a.stage.localeCompare(b.stage, 'ru');
        if (s !== 0) return s;
        return a.name.localeCompare(b.name, 'ru');
    });

    return rows;
}

exportPdfBtn.onclick = async () => {
    const fromMs = parseYmdToMs(pdfFrom.value);
    const toMs = parseYmdToMs(pdfTo.value);
    const toEnd = (toMs !== null) ? (toMs + 24 * 60 * 60 * 1000 - 1) : null;

    let data = rawReports.slice();
    if (fromMs) data = data.filter(r => Number(r.ts || 0) >= fromMs);
    if (toEnd) data = data.filter(r => Number(r.ts || 0) <= toEnd);

    if (!data.length) { alert("Нет данных для выбранного периода"); return; }

    const summaryRows = buildSummary(data);

    const period = (pdfFrom.value || '') + (pdfTo.value ? (' — ' + pdfTo.value) : '');
    const logoUrl = "https://s.fstl.ai/workers/nano/image_1770296525645_6vc4s2.png";
    const logoData = await loadImageAsDataURL(logoUrl).catch(() => '');

    const rowsHtml = data.map(r => `
        <tr>
            <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(r.order || '')}</td>
            <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(r.date || '')}</td>
            <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(r.time || '')}</td>
            <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(r.stage || '')}</td>
            <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(r.name || '')}</td>
            <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(r.db || '')}</td>
        </tr>
    `).join('');

    printArea.innerHTML = `
<div style="width:794px; padding:28px 30px; font-family:Arial, 'Segoe UI', sans-serif; box-sizing:border-box;">
    <div style="display:flex; align-items:center; gap:14px;">
        ${logoData ? `<img src="${logoData}" style="width:320px;height:auto;object-fit:contain;">` : ''}
        <div>
            <div style="font-size:20px;font-weight:700;">Отчёт ${period ? '(' + period + ')' : ''}</div>
            <div style="font-size:12px;color:#555;">Сформировано: ${new Date().toLocaleString()}</div>
        </div>
    </div>

    <div style="margin-top:12px;font-size:12px;font-weight:700;">Сводка по сотрудникам:</div>
    <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:11px;">
        <thead>
            <tr>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Этап</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Дата</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Сотрудник</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Кол-во заказов</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Номера заказов</th>
            </tr>
        </thead>
        <tbody>
            ${summaryRows.map(s => `
                <tr>
                    <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(s.stage)}</td>
                    <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(s.date)}</td>
                    <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(s.name)}</td>
                    <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(String(s.count))}</td>
                    <td style="border:1px solid #bbb;padding:6px 5px;">${escapeHtml(s.orders)}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:12px;">
        <thead>
            <tr>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Заказ</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Дата</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Время</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Этап</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Сотрудник</th>
                <th style="border:1px solid #bbb;padding:6px 5px;background:#f2f2f2;">Таблица</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>
</div>
`;

    const fullCanvas = await html2canvas(printArea, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = 210;
    const pageHeight = 297;

    const pageHeightPx = Math.floor(fullCanvas.width * (pageHeight / pageWidth));
    let y = 0;
    let pageIndex = 0;

    while (y < fullCanvas.height) {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = fullCanvas.width;
        pageCanvas.height = Math.min(pageHeightPx, fullCanvas.height - y);
        const pageCtx = pageCanvas.getContext('2d');

        pageCtx.fillStyle = '#ffffff';
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageCtx.drawImage(
            fullCanvas,
            0, y, pageCanvas.width, pageCanvas.height,
            0, 0, pageCanvas.width, pageCanvas.height);

        const imgData = pageCanvas.toDataURL('image/png');
        const imgHeightMm = (pageCanvas.height / pageCanvas.width) * pageWidth;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeightMm);

        y += pageHeightPx;
        pageIndex++;
    }

    pdf.save('reports.pdf');
};

openReportsBtn.onclick = openReports;
closeReportsBtn.onclick = closeReports;

if (openPhotoStoreBtn) {
    openPhotoStoreBtn.onclick = () => window.open(PHOTO_ROOT_URL, '_blank');
}

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
    } catch (e) { }
    location.href = location.href.split('?')[0] + '?hard=' + Date.now();
};

// автообновление PWA при новой версии SW
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('sw.js');
            reg.update();

            if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');

            reg.addEventListener('updatefound', () => {
                const nw = reg.installing;
                if (!nw) return;
                nw.addEventListener('statechange', () => {
                    if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                        if (!sessionStorage.getItem('sw-reloaded')) {
                            sessionStorage.setItem('sw-reloaded', '1');
                            location.reload();
                        }
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!sessionStorage.getItem('sw-reloaded')) {
                    sessionStorage.setItem('sw-reloaded', '1');
                    location.reload();
                }
            });
        } catch (e) { }
    });
}
