const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec'; // замените на свой URL

let currentStage = null;
let ordersData = []; // [{order, metric}]

// Получить имя сотрудника
function getWorkerName() {
  return document.getElementById('workerName').value.trim();
}

// Сохранить имя в localStorage
document.getElementById('workerName').addEventListener('input', (e) => {
  localStorage.setItem('workerName', e.target.value);
});

// Восстановить имя при загрузке
window.addEventListener('load', () => {
  const saved = localStorage.getItem('workerName');
  if (saved) document.getElementById('workerName').value = saved;
});

// Переключение на страницу этапа
function showStageForm(stage) {
  currentStage = stage;
  // Загружаем HTML формы (можно загружать динамически, но для простоты создадим разметку в JS)
  const container = document.querySelector('.container');
  container.innerHTML = `
    <a href="#" class="back-link" id="backLink">← Назад</a>
    <div class="form-page">
      <h2>${getStageTitle(stage)}</h2>
      <div id="ordersContainer"></div>
      <button id="addRow">+ Добавить заказ</button>
      <div class="summary">
        <div>Общий ${getMetricLabel(stage)}:</div>
        <div class="total" id="totalValue">0</div>
      </div>
      <div class="actions">
        <button id="loadFromScan" class="secondary">📥 Загрузить из Kairo-Scan</button>
        <button id="saveTotals">💾 Сохранить итоги</button>
      </div>
    </div>
  `;

  // Добавляем обработчики
  document.getElementById('backLink').addEventListener('click', (e) => {
    e.preventDefault();
    location.reload(); // возвращаем на главную
  });
  document.getElementById('addRow').addEventListener('click', addOrderRow);
  document.getElementById('loadFromScan').addEventListener('click', loadFromScan);
  document.getElementById('saveTotals').addEventListener('click', saveTotals);

  // Инициализируем одну пустую строку
  ordersData = [];
  addOrderRow();
}

function getStageTitle(stage) {
  const titles = {
    pila: 'Пила',
    kromka: 'Кромка',
    prisadka: 'Присадка',
    upakovka: 'Упаковка',
    hdf: 'Пила ХДФ'
  };
  return titles[stage] || stage;
}

function getMetricLabel(stage) {
  const labels = {
    pila: 'метраж (м²)',
    kromka: 'метраж (м)',
    prisadка: 'количество отверстий',
    upakovka: 'количество упаковок',
    hdf: 'метраж (м²)'
  };
  return labels[stage] || 'показатель';
}

function addOrderRow() {
  const container = document.getElementById('ordersContainer');
  const index = ordersData.length;
  const rowDiv = document.createElement('div');
  rowDiv.className = 'order-row';
  rowDiv.dataset.index = index;
  rowDiv.innerHTML = `
    <input type="text" placeholder="Номер заказа" class="order-input" value="${ordersData[index]?.order || ''}">
    <input type="number" placeholder="${getMetricLabel(currentStage)}" class="metric-input" step="any" value="${ordersData[index]?.metric || ''}">
    <button class="remove">✖</button>
  `;
  const orderInput = rowDiv.querySelector('.order-input');
  const metricInput = rowDiv.querySelector('.metric-input');
  const removeBtn = rowDiv.querySelector('.remove');

  orderInput.addEventListener('input', (e) => {
    ordersData[index] = ordersData[index] || {};
    ordersData[index].order = e.target.value;
    updateTotal();
  });
  metricInput.addEventListener('input', (e) => {
    ordersData[index] = ordersData[index] || {};
    ordersData[index].metric = parseFloat(e.target.value) || 0;
    updateTotal();
  });
  removeBtn.addEventListener('click', () => {
    ordersData.splice(index, 1);
    renderOrders();
  });

  container.appendChild(rowDiv);
  if (index >= ordersData.length) {
    ordersData.push({ order: '', metric: 0 });
  }
  updateTotal();
}

function renderOrders() {
  const container = document.getElementById('ordersContainer');
  container.innerHTML = '';
  ordersData.forEach((item, idx) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'order-row';
    rowDiv.dataset.index = idx;
    rowDiv.innerHTML = `
      <input type="text" placeholder="Номер заказа" class="order-input" value="${escapeHtml(item.order)}">
      <input type="number" placeholder="${getMetricLabel(currentStage)}" class="metric-input" step="any" value="${item.metric}">
      <button class="remove">✖</button>
    `;
    const orderInput = rowDiv.querySelector('.order-input');
    const metricInput = rowDiv.querySelector('.metric-input');
    const removeBtn = rowDiv.querySelector('.remove');

    orderInput.addEventListener('input', (e) => {
      ordersData[idx].order = e.target.value;
      updateTotal();
    });
    metricInput.addEventListener('input', (e) => {
      ordersData[idx].metric = parseFloat(e.target.value) || 0;
      updateTotal();
    });
    removeBtn.addEventListener('click', () => {
      ordersData.splice(idx, 1);
      renderOrders();
    });
    container.appendChild(rowDiv);
  });
  updateTotal();
}

function updateTotal() {
  const total = ordersData.reduce((sum, item) => sum + (item.metric || 0), 0);
  const totalEl = document.getElementById('totalValue');
  if (totalEl) totalEl.textContent = total;
}

// Загрузить заказы из Kairo-Scan
async function loadFromScan() {
  const name = getWorkerName();
  if (!name) {
    alert('Введите ваше имя');
    return;
  }
  const stage = currentStage;
  // Используем JSONP для запроса
  callApiJsonp({ action: 'get_today_orders', name, stage }, (res) => {
    if (!res.ok) {
      alert('Ошибка загрузки: ' + res.msg);
      return;
    }
    const orders = res.orders || [];
    if (orders.length === 0) {
      alert('За сегодня заказов не найдено');
      return;
    }
    // Добавляем заказы, которых ещё нет в списке
    for (const order of orders) {
      if (!ordersData.some(item => item.order === order)) {
        ordersData.push({ order, metric: 0 });
      }
    }
    renderOrders();
  }, (err) => {
    alert('Ошибка связи с сервером: ' + err);
  });
}

// Сохранить итоги
async function saveTotals() {
  const name = getWorkerName();
  if (!name) {
    alert('Введите ваше имя');
    return;
  }
  const orders = ordersData.map(item => item.order).filter(o => o);
  const metrics = ordersData.map(item => item.metric);
  const total = ordersData.reduce((sum, item) => sum + (item.metric || 0), 0);
  const date = new Date().toLocaleDateString('ru-RU');
  const data = {
    stage: currentStage,
    name,
    date,
    orders,
    metrics,
    total
  };
  callApiJsonp({ action: 'save_totals', data: JSON.stringify(data) }, (res) => {
    if (res.ok) {
      alert('Итоги сохранены!');
      // Очищаем форму или возвращаемся на главную
      location.reload();
    } else {
      alert('Ошибка сохранения: ' + res.msg);
    }
  }, (err) => {
    alert('Ошибка связи с сервером: ' + err);
  });
}

// JSONP функция
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

function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Обработчики кнопок выбора этапа
document.querySelectorAll('.stages button').forEach(btn => {
  btn.addEventListener('click', () => {
    const stage = btn.dataset.stage;
    showStageForm(stage);
  });
});
