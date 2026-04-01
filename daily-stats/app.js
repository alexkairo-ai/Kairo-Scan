const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec'; // замените на свой URL

let orders = []; // массив { order, metric }

// Элементы
const reportDateInput = document.getElementById('reportDate');
const stageSelect = document.getElementById('stageSelect');
const employeeSelect = document.getElementById('employeeSelect');
const ordersContainer = document.getElementById('ordersContainer');
const addOrderBtn = document.getElementById('addOrderBtn');
const loadFromScanBtn = document.getElementById('loadFromScanBtn');
const saveBtn = document.getElementById('saveBtn');
const totalMetricInput = document.getElementById('totalMetric');

// Табы
const tabInput = document.getElementById('tabInput');
const tabReports = document.getElementById('tabReports');
const inputPanel = document.getElementById('inputPanel');
const reportsPanel = document.getElementById('reportsPanel');

// Фильтры отчётов
const filterDateFrom = document.getElementById('filterDateFrom');
const filterDateTo = document.getElementById('filterDateTo');
const filterStage = document.getElementById('filterStage');
const filterEmployee = document.getElementById('filterEmployee');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const reportsTableBody = document.querySelector('#reportsTable tbody');

// Установка даты по умолчанию
reportDateInput.value = new Date().toISOString().slice(0, 10);

// Обновление суммы
function updateTotal() {
  const sum = orders.reduce((s, o) => s + (o.metric || 0), 0);
  totalMetricInput.value = sum;
}

// Добавление строки заказа
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

// Загрузка заказов из Kairo-Scan (с учётом выбранной даты)
function loadFromScan() {
  const employee = employeeSelect.value;
  const stage = stageSelect.value;
  const date = reportDateInput.value;
  if (!employee) {
    alert('Выберите сотрудника');
    return;
  }
  if (!date) {
    alert('Выберите дату');
    return;
  }
  // преобразуем дату в формат DD.MM.YYYY
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;

  callApiJsonp({ action: 'get_today_orders', name: employee, stage, date: formattedDate }, (res) => {
    if (!res.ok) {
      alert('Ошибка загрузки: ' + res.msg);
      return;
    }
    const ordersList = res.orders || [];
    if (ordersList.length === 0) {
      alert('За выбранную дату заказов не найдено');
      return;
    }
    // Добавляем заказы, которых нет в текущем списке
    for (const order of ordersList) {
      if (!orders.some(o => o.order === order)) {
        orders.push({ order, metric: 0 });
      }
    }
    renderOrders();
  }, (err) => alert('Ошибка связи: ' + err));
}

// Сохранение итогов
function saveTotals() {
  const date = reportDateInput.value;
  const stage = stageSelect.value;
  const employee = employeeSelect.value;
  if (!employee) {
    alert('Выберите сотрудника');
    return;
  }
  if (!date) {
    alert('Выберите дату');
    return;
  }
  // Преобразуем дату в формат DD.MM.YYYY
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;

  const ordersList = orders.map(o => o.order).filter(o => o);
  const metricsList = orders.map(o => o.metric);
  const total = parseFloat(totalMetricInput.value) || 0;

  const payload = {
    action: 'save_totals',
    data: JSON.stringify({ stage, name: employee, date: formattedDate, orders: ordersList, metrics: metricsList, total })
  };
  callApiJsonp(payload, (res) => {
    if (res.ok) {
      alert('Итоги сохранены!');
      // Очистка формы
      orders = [];
      renderOrders();
      totalMetricInput.value = '';
      // Если открыт просмотр отчётов, обновляем
      if (reportsPanel.style.display !== 'none') loadReports();
    } else {
      alert('Ошибка: ' + res.msg);
    }
  }, (err) => alert('Ошибка связи: ' + err));
}

// Загрузка списка сотрудников
function loadEmployees() {
  callApiJsonp({ action: 'get_employees' }, (res) => {
    if (res.ok) {
      const employees = res.employees || [];
      employeeSelect.innerHTML = '<option value="">-- Выберите имя --</option>' +
        employees.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
      filterEmployee.innerHTML = '<option value="">Все</option>' +
        employees.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    } else {
      console.error('Ошибка загрузки сотрудников');
    }
  }, (err) => console.error(err));
}

// Загрузка отчётов
function loadReports() {
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  const stage = filterStage.value;
  const employee = filterEmployee.value;

  callApiJsonp({
    action: 'get_totals',
    from, to, stage, employee
  }, (res) => {
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
    reportsTableBody.innerHTML = data.map(row => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(stageNames[row.stage] || row.stage)}</td>
        <td>${escapeHtml(row.employee)}</td>
        <td>${escapeHtml(row.orders)}</td>
        <td>${escapeHtml(row.metrics)}</td>
        <td>${escapeHtml(row.total)}</td>
      </tr>
    `).join('');
  }, (err) => {
    reportsTableBody.innerHTML = '<tr><td colspan="6">Ошибка связи</td></tr>';
  });
}

// Экспорт в Excel (CSV)
function exportToExcel() {
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  const stage = filterStage.value;
  const employee = filterEmployee.value;

  callApiJsonp({
    action: 'get_totals',
    from, to, stage, employee
  }, (res) => {
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
    const headers = ['Дата', 'Этап', 'Сотрудник', 'Заказы', 'Показатели', 'Итого'];
    const rows = data.map(row => [
      row.date,
      stageNames[row.stage] || row.stage,
      row.employee,
      row.orders,
      row.metrics,
      row.total
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `totals_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, (err) => alert('Ошибка связи'));
}

// Переключение вкладок
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  loadEmployees();
  addOrderRow(); // стартовая пустая строка

  addOrderBtn.addEventListener('click', () => addOrderRow());
  loadFromScanBtn.addEventListener('click', loadFromScan);
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
});

// JSONP helper
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
