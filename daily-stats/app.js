const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec'; // замените на свой URL

let orders = [];
let employeesData = [];
let filteredEmployees = [];
let currentEmployee = null;
let currentStages = [];

let employeeAliases = {};
let hiddenNames = [];

const loadingIndicator = document.getElementById('loadingIndicator');
const reportDateInput = document.getElementById('reportDate');
const employeeSelect = document.getElementById('employeeSelect');
const stageSelectGroup = document.getElementById('stageSelectGroup');
const stageSelect = document.getElementById('stageSelect');
const ordersContainer = document.getElementById('ordersContainer');
const addOrderBtn = document.getElementById('addOrderBtn');
const loadFromScanBtn = document.getElementById('loadFromScanBtn');
const saveBtn = document.getElementById('saveBtn');
const totalMetricInput = document.getElementById('totalMetric');

const tabInput = document.getElementById('tabInput');
const tabReports = document.getElementById('tabReports');
const inputPanel = document.getElementById('inputPanel');
const reportsPanel = document.getElementById('reportsPanel');

const filterDateFrom = document.getElementById('filterDateFrom');
const filterDateTo = document.getElementById('filterDateTo');
const filterStage = document.getElementById('filterStage');
const filterEmployee = document.getElementById('filterEmployee');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const reportsTableBody = document.querySelector('#reportsTable tbody');

const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.querySelector('.close');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const employeesSettingsList = document.getElementById('employeesSettingsList');

reportDateInput.value = new Date().toISOString().slice(0, 10);

// ========== Вспомогательные функции ==========
function setLoading(show, text = 'Загрузка...') {
  if (show) {
    loadingIndicator.textContent = '⏳ ' + text;
    loadingIndicator.style.display = 'block';
  } else {
    loadingIndicator.style.display = 'none';
  }
}

function updateTotal() {
  const sum = orders.reduce((s, o) => s + (o.metric || 0), 0);
  totalMetricInput.value = sum;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Преобразование YYYY-MM-DD в DD.MM.YY
function formatToDDMMYY(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year.slice(-2)}`;
}

// Преобразование YYYY-MM-DD в DD.MM.YYYY
function formatToDDMMYYYY(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

// Получение количества заказов из строки
function getOrdersCount(ordersStr) {
  if (!ordersStr) return 0;
  const items = ordersStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
  return items.length;
}

// ========== Работа с настройками ==========
function loadSettings() {
  try {
    const saved = localStorage.getItem('employeeSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      employeeAliases = settings.aliases || {};
      hiddenNames = settings.hidden || [];
    } else {
      employeeAliases = {};
      hiddenNames = [];
    }
  } catch(e) {
    employeeAliases = {};
    hiddenNames = [];
  }
}

function saveSettings() {
  localStorage.setItem('employeeSettings', JSON.stringify({
    aliases: employeeAliases,
    hidden: hiddenNames
  }));
}

function resetSettings() {
  employeeAliases = {};
  hiddenNames = {};
  saveSettings();
  rebuildFilteredEmployees();
  populateEmployeeSelect();
  closeSettingsModal();
  alert('Настройки сброшены');
}

function rebuildFilteredEmployees() {
  const allEmployees = [...employeesData];
  const visible = allEmployees.filter(emp => !hiddenNames.includes(emp.name));
  const aliasMap = new Map();
  for (const emp of visible) {
    let displayName = emp.name;
    for (const [alias, names] of Object.entries(employeeAliases)) {
      if (names.includes(emp.name)) {
        displayName = alias;
        break;
      }
    }
    if (!aliasMap.has(displayName)) {
      aliasMap.set(displayName, { originalNames: new Set(), stages: new Set() });
    }
    const entry = aliasMap.get(displayName);
    entry.originalNames.add(emp.name);
    for (const stage of emp.stages) {
      entry.stages.add(stage);
    }
  }
  filteredEmployees = [];
  for (const [displayName, data] of aliasMap.entries()) {
    filteredEmployees.push({
      displayName: displayName,
      originalNames: Array.from(data.originalNames),
      stages: Array.from(data.stages)
    });
  }
  filteredEmployees.sort((a,b) => a.displayName.localeCompare(b.displayName));
}

function populateEmployeeSelect() {
  employeeSelect.innerHTML = '<option value="">-- Выберите имя --</option>';
  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  filteredEmployees.forEach(emp => {
    let displayName = emp.displayName;
    if (emp.stages.length === 1) {
      const stageKey = emp.stages[0];
      const stageDisplay = stageNames[stageKey] || stageKey;
      displayName = `${emp.displayName} (${stageDisplay})`;
    }
    employeeSelect.innerHTML += `<option value="${escapeHtml(emp.displayName)}">${escapeHtml(displayName)}</option>`;
  });
  filterEmployee.innerHTML = '<option value="">Все</option>';
  filteredEmployees.forEach(emp => {
    filterEmployee.innerHTML += `<option value="${escapeHtml(emp.displayName)}">${escapeHtml(emp.displayName)}</option>`;
  });
}

function openSettingsModal() {
  const allNames = [...new Set(employeesData.map(e => e.name))];
  employeesSettingsList.innerHTML = '';
  for (const name of allNames) {
    const isHidden = hiddenNames.includes(name);
    let currentAlias = null;
    for (const [alias, names] of Object.entries(employeeAliases)) {
      if (names.includes(name)) {
        currentAlias = alias;
        break;
      }
    }
    const div = document.createElement('div');
    div.className = 'employee-setting';
    div.innerHTML = `
      <span class="name">${escapeHtml(name)}</span>
      <label class="hide-check">
        <input type="checkbox" data-name="${escapeHtml(name)}" class="hide-checkbox" ${isHidden ? 'checked' : ''}>
        Скрыть
      </label>
      <select class="alias-select" data-name="${escapeHtml(name)}">
        <option value="">-- Без объединения --</option>
        ${allNames.map(n => `<option value="${escapeHtml(n)}" ${currentAlias === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
      </select>
      <span style="font-size:12px;">(объединить с именем)</span>
    `;
    employeesSettingsList.appendChild(div);
  }
  settingsModal.style.display = 'block';
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

function applySettingsFromModal() {
  const newHidden = [];
  const newAliases = {};
  const allNames = [...new Set(employeesData.map(e => e.name))];
  for (const name of allNames) {
    const hideCheck = document.querySelector(`.hide-checkbox[data-name="${escapeHtml(name)}"]`);
    if (hideCheck && hideCheck.checked) {
      newHidden.push(name);
    }
    const aliasSelect = document.querySelector(`.alias-select[data-name="${escapeHtml(name)}"]`);
    if (aliasSelect && aliasSelect.value && aliasSelect.value !== name) {
      const targetAlias = aliasSelect.value;
      if (!newAliases[targetAlias]) newAliases[targetAlias] = [];
      newAliases[targetAlias].push(name);
    }
  }
  hiddenNames = newHidden;
  employeeAliases = newAliases;
  saveSettings();
  rebuildFilteredEmployees();
  populateEmployeeSelect();
  closeSettingsModal();
  if (reportsPanel.style.display !== 'none') loadReports();
  alert('Настройки применены');
}

// ========== Загрузка сотрудников из Kairo-Scan ==========
function loadEmployees() {
  const cached = localStorage.getItem('employeesData');
  const cacheTime = localStorage.getItem('employeesDataTime');
  if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < 3600000)) {
    try {
      employeesData = JSON.parse(cached);
      loadSettings();
      rebuildFilteredEmployees();
      populateEmployeeSelect();
      return;
    } catch(e) {}
  }
  setLoading(true, 'Загрузка списка сотрудников...');
  callApiJsonp({ action: 'get_employees' }, (res) => {
    setLoading(false);
    if (res.ok) {
      employeesData = res.employees || [];
      localStorage.setItem('employeesData', JSON.stringify(employeesData));
      localStorage.setItem('employeesDataTime', Date.now().toString());
      loadSettings();
      rebuildFilteredEmployees();
      populateEmployeeSelect();
    } else {
      console.error('Ошибка загрузки сотрудников');
      employeeSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
    }
  }, (err) => {
    setLoading(false);
    console.error(err);
    employeeSelect.innerHTML = '<option value="">Ошибка связи</option>';
  });
}

// ========== Обработка выбора сотрудника ==========
function onEmployeeChange() {
  const displayName = employeeSelect.value;
  if (!displayName) {
    stageSelectGroup.style.display = 'none';
    currentEmployee = null;
    currentStages = [];
    return;
  }
  currentEmployee = filteredEmployees.find(e => e.displayName === displayName);
  if (!currentEmployee) return;
  currentStages = currentEmployee.stages || [];
  if (currentStages.length === 0) {
    stageSelectGroup.style.display = 'none';
    return;
  }
  if (currentStages.length === 1) {
    stageSelectGroup.style.display = 'none';
  } else {
    stageSelectGroup.style.display = 'block';
    stageSelect.innerHTML = '<option value="">-- Выберите этап --</option>';
    const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
    currentStages.forEach(stage => {
      stageSelect.innerHTML += `<option value="${stage}">${stageNames[stage] || stage}</option>`;
    });
  }
}

// ========== Загрузка заказов из Kairo-Scan ==========
async function loadOrdersForAlias(stage, date) {
  if (!currentEmployee) return [];
  const originalNames = currentEmployee.originalNames;
  if (!originalNames.length) return [];
  const allOrders = [];
  const promises = originalNames.map(name => {
    return new Promise((resolve) => {
      // Передаём дату в формате DD.MM.YYYY, как ожидает Kairo-Scan
      callApiJsonp({ action: 'get_today_orders', name, stage, date }, (res) => {
        if (res.ok && res.orders) {
          resolve(res.orders);
        } else {
          resolve([]);
        }
      }, () => resolve([]));
    });
  });
  const results = await Promise.all(promises);
  const orderSet = new Set();
  for (const ordersList of results) {
    for (const order of ordersList) {
      orderSet.add(order);
    }
  }
  return Array.from(orderSet);
}

function loadFromScan() {
  if (!currentEmployee) {
    alert('Выберите сотрудника');
    return;
  }
  let stage = null;
  if (currentStages.length === 1) {
    stage = currentStages[0];
  } else if (stageSelectGroup.style.display !== 'none' && stageSelect.value) {
    stage = stageSelect.value;
  }
  if (!stage) {
    alert('Не определён этап для сотрудника');
    return;
  }
  const dateInput = reportDateInput.value;
  if (!dateInput) {
    alert('Выберите дату');
    return;
  }
  // Отправляем дату в формате DD.MM.YYYY (как ожидает Kairo-Scan)
  const dateYYYY = formatToDDMMYYYY(dateInput);
  console.log('Загрузка заказов для', currentEmployee.displayName, stage, dateYYYY);
  setLoading(true, 'Загрузка заказов...');
  loadOrdersForAlias(stage, dateYYYY).then(ordersList => {
    setLoading(false);
    if (ordersList.length === 0) {
      alert('За выбранную дату заказов не найдено');
      return;
    }
    for (const order of ordersList) {
      if (!orders.some(o => o.order === order)) {
        orders.push({ order, metric: 0 });
      }
    }
    renderOrders();
  }).catch(err => {
    setLoading(false);
    alert('Ошибка загрузки: ' + err);
  });
}

// ========== Сохранение итогов ==========
function saveTotals() {
  if (!currentEmployee) {
    alert('Выберите сотрудника');
    return;
  }
  const dateInput = reportDateInput.value;
  if (!dateInput) {
    alert('Выберите дату');
    return;
  }
  let stage = null;
  if (currentStages.length === 1) {
    stage = currentStages[0];
  } else if (stageSelectGroup.style.display !== 'none' && stageSelect.value) {
    stage = stageSelect.value;
  }
  if (!stage) {
    alert('Не определён этап для сотрудника');
    return;
  }
  const formattedDate = formatToDDMMYY(dateInput); // Сохраняем в формате DD.MM.YY
  const ordersList = orders.map(o => o.order).filter(o => o);
  const metricsList = orders.map(o => o.metric);
  const total = parseFloat(totalMetricInput.value) || 0;
  setLoading(true, 'Сохранение...');
  const payload = {
    action: 'save_totals',
    data: JSON.stringify({ stage, name: currentEmployee.displayName, date: formattedDate, orders: ordersList, metrics: metricsList, total })
  };
  callApiJsonp(payload, (res) => {
    setLoading(false);
    if (res.ok) {
      alert('Итоги сохранены!');
      orders = [];
      renderOrders();
      totalMetricInput.value = '';
      if (reportsPanel.style.display !== 'none') loadReports();
    } else {
      alert('Ошибка: ' + res.msg);
    }
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи: ' + err);
  });
}

// ========== Отчёты и экспорт ==========
function loadReports() {
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  const stage = filterStage.value;
  const employee = filterEmployee.value;
  // Преобразуем даты в формат DD.MM.YY для передачи в Kairo-Scan
  const fromFormatted = from ? formatToDDMMYY(from) : '';
  const toFormatted = to ? formatToDDMMYY(to) : '';
  setLoading(true, 'Загрузка отчётов...');
  callApiJsonp({
    action: 'get_totals',
    from: fromFormatted,
    to: toFormatted,
    stage,
    employee
  }, (res) => {
    setLoading(false);
    if (!res.ok) {
      reportsTableBody.innerHTML = '<tr><td colspan="6">Ошибка загрузки</td></tr>';
      return;
    }
    const data = res.data || [];
    const stageNames = {
      pila: 'Пила',
      kromka: 'Кромка',
      prisadka: 'Присадка',
      upakovka: 'Упаковка',
      hdf: 'Пила ХДФ'
    };
    reportsTableBody.innerHTML = data.map(row => {
      const ordersCount = getOrdersCount(row.orders);
      return `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(stageNames[row.stage] || row.stage)}</td>
          <td>${escapeHtml(row.employee)}</td>
          <td>${escapeHtml(row.orders)}</td>
          <td style="text-align:center;">${ordersCount}</td>
          <td style="text-align:right;">${escapeHtml(row.total)}</td>
        </tr>
      `;
    }).join('');
  }, (err) => {
    setLoading(false);
    reportsTableBody.innerHTML = '<tr><td colspan="6">Ошибка связи</td></tr>';
  });
}

function exportToExcel() {
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  const stage = filterStage.value;
  const employee = filterEmployee.value;
  const fromFormatted = from ? formatToDDMMYY(from) : '';
  const toFormatted = to ? formatToDDMMYY(to) : '';
  setLoading(true, 'Подготовка экспорта...');
  callApiJsonp({
    action: 'get_totals',
    from: fromFormatted,
    to: toFormatted,
    stage,
    employee
  }, (res) => {
    setLoading(false);
    if (!res.ok) {
      alert('Ошибка загрузки');
      return;
    }
    const data = res.data || [];
    const stageNames = {
      pila: 'Пила',
      kromka: 'Кромка',
      prisadka: 'Присадка',
      upakovka: 'Упаковка',
      hdf: 'Пила ХДФ'
    };
    let html = `
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Итоги дня</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; margin-top: 20px; }
          th, td { border: 1px solid #7f8c8d; padding: 8px; vertical-align: top; }
          th { background-color: #f2c94c; color: #000; text-align: center; font-weight: bold; }
          td { text-align: left; }
          td:nth-child(5) { text-align: center; }
          td:nth-child(6) { text-align: right; }
          .header { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
          .subheader { font-size: 12px; color: #555; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">Отчёт по итогам дня</div>
        <div class="subheader">Период: ${fromFormatted || 'все'} — ${toFormatted || 'все'} | Этап: ${filterStage.options[filterStage.selectedIndex]?.text || 'все'} | Сотрудник: ${employee || 'все'}</div>
        <table>
          <thead>
            <tr><th>Дата</th><th>Этап</th><th>Сотрудник</th><th>Заказы</th><th>Кол-во заказов</th><th>Итого</th></tr>
          </thead>
          <tbody>
    `;
    for (const row of data) {
      const ordersCount = getOrdersCount(row.orders);
      html += `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(stageNames[row.stage] || row.stage)}</td>
          <td>${escapeHtml(row.employee)}</td>
          <td>${escapeHtml(row.orders)}</td>
          <td style="text-align:center;">${ordersCount}</td>
          <td style="text-align:right;">${escapeHtml(row.total)}</td>
        </tr>
      `;
    }
    html += `</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `totals_${new Date().toISOString().slice(0,10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи');
  });
}

// ========== Работа с заказами (ввод) ==========
function addOrderRow(orderVal = '', metricVal = '') {
  const index = orders.length;
  const rowDiv = document.createElement('div');
  rowDiv.className = 'order-row';
  rowDiv.innerHTML = `
    <input type="text" placeholder="Номер заказа" class="order-input" value="${escapeHtml(orderVal)}">
    <input type="number" placeholder="Показатель" class="metric-input" step="any" value="${metricVal}">
    <button class="remove">✖</button>
  `;
  const orderInput = rowDiv.querySelector('.order-input');
  const metricInput = rowDiv.querySelector('.metric-input');
  const removeBtn = rowDiv.querySelector('.remove');

  orderInput.addEventListener('input', (e) => {
    orders[index].order = e.target.value;
  });
  metricInput.addEventListener('input', (e) => {
    orders[index].metric = parseFloat(e.target.value) || 0;
    updateTotal();
  });
  removeBtn.addEventListener('click', () => {
    orders.splice(index, 1);
    renderOrders();
    updateTotal();
  });

  ordersContainer.appendChild(rowDiv);
  orders.push({ order: orderVal, metric: parseFloat(metricVal) || 0 });
  updateTotal();
}

function renderOrders() {
  ordersContainer.innerHTML = '';
  orders.forEach((item, idx) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'order-row';
    rowDiv.innerHTML = `
      <input type="text" placeholder="Номер заказа" class="order-input" value="${escapeHtml(item.order)}">
      <input type="number" placeholder="Показатель" class="metric-input" step="any" value="${item.metric}">
      <button class="remove">✖</button>
    `;
    const orderInput = rowDiv.querySelector('.order-input');
    const metricInput = rowDiv.querySelector('.metric-input');
    const removeBtn = rowDiv.querySelector('.remove');
    orderInput.addEventListener('input', (e) => { orders[idx].order = e.target.value; });
    metricInput.addEventListener('input', (e) => { orders[idx].metric = parseFloat(e.target.value) || 0; updateTotal(); });
    removeBtn.addEventListener('click', () => { orders.splice(idx, 1); renderOrders(); updateTotal(); });
    ordersContainer.appendChild(rowDiv);
  });
  updateTotal();
}

// ========== Переключение вкладок ==========
function switchTab(tab) {
  if (tab === 'input') {
    inputPanel.style.display = 'block';
    reportsPanel.style.display = 'none';
    tabInput.classList.add('active');
    tabReports.classList.remove('active');
  } else {
    inputPanel.style.display = 'none';
    reportsPanel.style.display = 'block';
    tabReports.classList.add('active');
    tabInput.classList.remove('active');
    loadReports();
  }
}

// ========== JSONP helper ==========
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

// ========== Инициализация ==========
document.addEventListener('DOMContentLoaded', () => {
  loadEmployees();
  addOrderRow();

  addOrderBtn.addEventListener('click', () => addOrderRow());
  loadFromScanBtn.addEventListener('click', loadFromScan);
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
  employeeSelect.addEventListener('change', onEmployeeChange);

  settingsBtn.addEventListener('click', openSettingsModal);
  closeModal.addEventListener('click', closeSettingsModal);
  window.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });
  saveSettingsBtn.addEventListener('click', applySettingsFromModal);
  resetSettingsBtn.addEventListener('click', resetSettings);
});
