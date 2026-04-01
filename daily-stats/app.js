const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec'; // замените на свой URL

let orders = [];
let employeesData = [];
let currentEmployeeStage = null;
let currentStages = [];

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

reportDateInput.value = new Date().toISOString().slice(0, 10);

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

function getOrdersCount(ordersStr) {
  if (!ordersStr) return 0;
  // Разделяем по запятой, обрезаем пробелы, убираем пустые
  const items = ordersStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
  return items.length;
}

function loadFromScan() {
  const employee = employeeSelect.value;
  if (!employee) {
    alert('Выберите сотрудника');
    return;
  }

  let stage = null;
  if (currentEmployeeStage) {
    stage = currentEmployeeStage;
  } else if (stageSelectGroup.style.display !== 'none' && stageSelect.value) {
    stage = stageSelect.value;
  }

  if (!stage) {
    alert('Не удалось определить этап для сотрудника. Возможно, у него несколько этапов — выберите вручную.');
    return;
  }

  const date = reportDateInput.value;
  if (!date) {
    alert('Выберите дату');
    return;
  }

  const [year, month, day] = date.split('-');
  const shortYear = year.slice(-2);
  const formattedDate = `${day}.${month}.${shortYear}`;

  console.log('📤 Отправка запроса:', {
    action: 'get_today_orders',
    name: employee,
    stage: stage,
    date: formattedDate
  });

  setLoading(true, 'Загрузка заказов...');
  callApiJsonp({ action: 'get_today_orders', name: employee, stage, date: formattedDate }, (res) => {
    setLoading(false);
    console.log('📥 Ответ от сервера:', res);
    if (!res.ok) {
      alert('Ошибка загрузки: ' + (res.msg || 'неизвестная ошибка'));
      return;
    }
    const ordersList = res.orders || [];
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
  }, (err) => {
    setLoading(false);
    console.error('❌ Ошибка связи:', err);
    alert('Ошибка связи: ' + err);
  });
}

function saveTotals() {
  const date = reportDateInput.value;
  const employee = employeeSelect.value;
  if (!employee) {
    alert('Выберите сотрудника');
    return;
  }
  if (!date) {
    alert('Выберите дату');
    return;
  }

  let stage = null;
  if (currentEmployeeStage) {
    stage = currentEmployeeStage;
  } else if (stageSelectGroup.style.display !== 'none' && stageSelect.value) {
    stage = stageSelect.value;
  }

  if (!stage) {
    alert('Не определён этап для сотрудника');
    return;
  }

  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year.slice(-2)}`;

  const ordersList = orders.map(o => o.order).filter(o => o);
  const metricsList = orders.map(o => o.metric);
  const total = parseFloat(totalMetricInput.value) || 0;

  setLoading(true, 'Сохранение...');
  const payload = {
    action: 'save_totals',
    data: JSON.stringify({ stage, name: employee, date: formattedDate, orders: ordersList, metrics: metricsList, total })
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

function loadEmployees() {
  const cached = localStorage.getItem('employeesData');
  const cacheTime = localStorage.getItem('employeesDataTime');
  if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < 3600000)) {
    try {
      employeesData = JSON.parse(cached);
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

function populateEmployeeSelect() {
  employeeSelect.innerHTML = '<option value="">-- Выберите имя --</option>';
  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  employeesData.forEach(emp => {
    let displayName = emp.name;
    if (emp.stages.length === 1) {
      const stageKey = emp.stages[0];
      const stageDisplay = stageNames[stageKey] || stageKey;
      displayName = `${emp.name} (${stageDisplay})`;
    }
    employeeSelect.innerHTML += `<option value="${escapeHtml(emp.name)}">${escapeHtml(displayName)}</option>`;
  });
  filterEmployee.innerHTML = '<option value="">Все</option>';
  employeesData.forEach(emp => {
    filterEmployee.innerHTML += `<option value="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}</option>`;
  });
}

function onEmployeeChange() {
  const name = employeeSelect.value;
  if (!name) {
    stageSelectGroup.style.display = 'none';
    currentEmployeeStage = null;
    currentStages = [];
    return;
  }
  const employee = employeesData.find(e => e.name === name);
  if (!employee) return;
  currentStages = employee.stages || [];
  if (currentStages.length === 0) {
    stageSelectGroup.style.display = 'none';
    currentEmployeeStage = null;
    return;
  }
  if (currentStages.length === 1) {
    stageSelectGroup.style.display = 'none';
    currentEmployeeStage = currentStages[0];
  } else {
    stageSelectGroup.style.display = 'block';
    currentEmployeeStage = null;
    stageSelect.innerHTML = '<option value="">-- Выберите этап --</option>';
    const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
    currentStages.forEach(stage => {
      stageSelect.innerHTML += `<option value="${stage}">${stageNames[stage] || stage}</option>`;
    });
  }
}

function loadReports() {
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  const stage = filterStage.value;
  const employee = filterEmployee.value;

  setLoading(true, 'Загрузка отчётов...');
  callApiJsonp({
    action: 'get_totals',
    from, to, stage, employee
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

  setLoading(true, 'Подготовка экспорта...');
  callApiJsonp({
    action: 'get_totals',
    from, to, stage, employee
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

    // Формируем HTML для Excel
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
        <div class="subheader">Период: ${from || 'все'} — ${to || 'все'} | Этап: ${filterStage.options[filterStage.selectedIndex]?.text || 'все'} | Сотрудник: ${employee || 'все'}</div>
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

    html += `
          </tbody>
        </table>
      </body>
      </html>
    `;

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
});

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
