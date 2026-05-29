const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec'; // замените на свой URL

let stream = null, locked = false, starting = false, stopTimer = null;
let currentOrder = null;
let currentClient = null;

const video = document.getElementById('video');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startCam');
const msg = document.getElementById('msg');
const scanOverlay = document.getElementById('scanOverlay');
const orderInfo = document.getElementById('orderInfo');
const orderNumberSpan = document.getElementById('orderNumber');
const clientNameSpan = document.getElementById('clientName');
const buttonsPanel = document.getElementById('buttonsPanel');
const greenBtn = document.getElementById('greenBtn');
const orangeBtn = document.getElementById('orangeBtn');

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

async function startCamera() {
  if (starting) return;
  starting = true;
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const perm = await navigator.permissions.query({ name: 'camera' });
      if (perm.state === 'denied') {
        msg.innerHTML = "⚠️ Доступ к камере запрещён. Разрешите в настройках.";
        showScanButton(true);
        starting = false;
        return;
      }
    } catch(e) {}
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
      msg.innerHTML = "Камера не запустилась. Проверьте HTTPS и доступ.";
      showScanButton(true);
      starting = false;
      return;
    }
  }
  try {
    video.srcObject = stream;
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
    msg.innerHTML = "Не удалось запустить видео. Обновите страницу.";
    stopCamera();
  } finally {
    starting = false;
  }
}
startBtn.addEventListener('click', startCamera);

const hasBarcodeDetector = ('BarcodeDetector' in window);
const detector = hasBarcodeDetector ? new BarcodeDetector({ formats: ['qr_code'] }) : null;

function scan() {
  if (locked) return;
  if (!isStreamActive()) return;

  if (hasBarcodeDetector) {
    detector.detect(video).then(codes => {
      if (codes && codes.length) {
        const data = codes[0].rawValue || '';
        processQR(data);
        freezeCamera();
        return;
      }
      requestAnimationFrame(scan);
    }).catch(() => requestAnimationFrame(scan));
    return;
  }

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (code) {
      const data = code.data;
      processQR(data);
      freezeCamera();
      return;
    }
  }
  requestAnimationFrame(scan);
}

function processQR(qrData) {
  const parts = qrData.split('|');
  if (parts.length !== 2) {
    msg.innerHTML = '⚠️ Неверный формат QR (ожидается КЛИЕНТ|НОМЕР)';
    return;
  }
  const client = parts[0].trim();
  const order = parts[1].trim();
  if (!client || !order) {
    msg.innerHTML = '⚠️ Неверный QR: клиент или заказ пуст';
    return;
  }
  currentClient = client;
  currentOrder = order;
  orderNumberSpan.textContent = order;
  clientNameSpan.textContent = client;
  orderInfo.classList.remove('hidden');
  buttonsPanel.classList.remove('hidden');
  msg.innerHTML = '✅ QR распознан. Выберите действие.';
  showScanOverlay(order);
}

function callApiJsonp(params, cb, onError) {
  const cbName = 'cb_' + Math.random().toString(36).slice(2);
  let done = false;
  window[cbName] = function (res) {
    if (done) return;
    done = true;
    clearTimeout(timeout);
    cb(res);
    setTimeout(() => delete window[cbName], 30000);
  };
  const timeout = setTimeout(() => {
    if (!done) {
      done = true;
      if (onError) onError('Нет ответа от сервера');
      delete window[cbName];
    }
  }, 15000);
  const query = new URLSearchParams(params);
  query.set('api', '1');
  query.set('callback', cbName);
  query.set('_ts', Date.now());
  const script = document.createElement('script');
  script.src = API_URL + '?' + query.toString();
  script.onerror = () => {
    if (!done) {
      done = true;
      clearTimeout(timeout);
      if (onError) onError('Ошибка загрузки');
      delete window[cbName];
    }
  };
  document.body.appendChild(script);
}

function sendMark(stage, comment = '') {
  if (!currentClient || !currentOrder) {
    alert('Нет данных о заказе');
    return;
  }
  callApiJsonp({
    action: 'mark_furnitura',
    db: currentClient,
    order: currentOrder,
    stage: stage,
    comment: comment
  }, (res) => {
    if (res.ok) {
      alert('Отмечено!');
      orderInfo.classList.add('hidden');
      buttonsPanel.classList.add('hidden');
      currentClient = null;
      currentOrder = null;
      hideScanOverlay();
      startCamera();
    } else {
      alert('Ошибка: ' + res.msg);
    }
  }, (err) => {
    alert('Ошибка связи: ' + err);
  });
}

greenBtn.onclick = () => {
  sendMark('green');
};
orangeBtn.onclick = () => {
  const comment = prompt('Введите комментарий (причина проблемы):');
  if (comment !== null) {
    sendMark('orange', comment);
  }
};

// Регистрация Service Worker для PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW registration failed:', err));
}
