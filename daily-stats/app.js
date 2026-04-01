const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec'; // замените на свой URL

let orders = []; // массив { order, metric }
let employeesData = []; // массив объектов { name, stages }
let currentStages = []; // для текущего выбранного сотрудника

// Элементы
const loadingIndicator = document.getElementById('loadingIndicator');
const reportDateInput = document.getElementById('reportDate');
const employeeSelect = document.getElementById('employeeSelect');
const stageSelectGroup = document.getElementById('stageSelectGroup');
const stageSelect = document.getElementById('stageSelect');
const stageInfo = document.getElementById('stageInfo');
const stageReadonly = document.getElementById('stageReadonly');
const stageReadonlyDisplay = document.getElementById('stageReadonlyDisplay');
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

// Функция показа/скрытия загрузки
function setLoading(show, text = 'Загрузка...') {
  if (show) {
    loadingIndicator.textContent = '⏳ ' + text;
    loadingIndicator.style.display = 'block';
  } else {
    loadingIndicator.style.display = 'none';
  }
}

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

// Загрузка заказов из Kairo-Scan
function loadFromScan() {
  const employee = employeeSelect.value;
  if (!employee) {
    alert('Выберите сотрудника');
    return;
  }
  // Определяем выбранный этап
  let stage = null;
  if (stageSelectGroup.style.display !== 'none' && stageSelect.value) {
    stage = stageSelect.value;
  } else if (stageInfo.style.display !== 'none' && stageReadonly.value) {
    stage = stageReadonly.value;
  }
  if (!stage) {
    alert('Не определён этап для сотрудника');
    return;
  }
  const date = reportDateInput.value;
  if (!date) {
    alert('Выберите дату');
    return;
  }
  // преобразуем дату в формат DD.MM.YYYY
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;

  setLoading(true, 'Загрузка заказов...');
  callApiJsonp({ action: 'get_today_orders', name: employee, stage, date: formattedDate }, (res) => {
    setLoading(false);
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
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи: ' + err);
  });
}

// Сохранение итогов
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
  // Определяем этап
  let stage = null;
  if (stageSelectGroup.style.display !== 'none' && stageSelect.value) {
    stage = stageSelect.value;
  } else if (stageInfo.style.display !== 'none' && stageReadonly.value) {
    stage = stageReadonly.value;
  }
  if (!stage) {
    alert('Не определён этап для сотрудника');
    return;
  }
  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year}`;

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
      // Очистка формы
      orders = [];
      renderOrders();
      totalMetricInput.value = '';
      // Если открыт просмотр отчётов, обновляем
      if (reportsPanel.style.display !== 'none') loadReports();
    } else {
      alert('Ошибка: ' + res.msg);
    }
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи: ' + err);
  });
}

// Загрузка списка сотрудников (с этапами)
function loadEmployees() {
  // Проверяем кэш в localStorage
  const cached = localStorage.getItem('employeesData');
  const cacheTime = localStorage.getItem('employeesDataTime');
  if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < 3600000)) { // 1 час
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
  // Также заполняем фильтр сотрудников
  filterEmployee.innerHTML = '<option value="">Все</option>';
  employeesData.forEach(emp => {
    filterEmployee.innerHTML += `<option value="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}</option>`;
  });
}

// Обновление селекта этапов при выборе сотрудника
function onEmployeeChange() {
  const name = employeeSelect.value;
  if (!name) {
    stageSelectGroup.style.display = 'none';
    stageInfo.style.display = 'none';
    return;
  }
  const employee = employeesData.find(e => e.name === name);
  if (!employee) return;
  currentStages = employee.stages || [];
  if (currentStages.length === 0) {
    stageSelectGroup.style.display = 'none';
    stageInfo.style.display = 'none';
    return;
  }
  if (currentStages.length === 1) {
    // Показываем read-only поле с ключом и отображаем красивое имя
    stageInfo.style.display = 'block';
    stageSelectGroup.style.display = 'none';
    const stageKey = currentStages[0];
    const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
    const stageDisplayText = stageNames[stageKey] || stageKey;
    stageReadonly.value = stageKey;          // сохраняем ключ
    stageReadonlyDisplay.textContent = stageDisplayText;
  } else {
    // Показываем выпадающий список
    stageInfo.style.display = 'none';
    stageSelectGroup.style.display = 'block';
    stageSelect.innerHTML = '<option value="">-- Выберите этап --</option>';
    const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
    currentStages.forEach(stage => {
      stageSelect.innerHTML += `<option value="${stage}">${stageNames[stage] || stage}</option>`;
    });
  }
}

// Загрузка отчётов
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
    setLoading(false);
    reportsTableBody.innerHTML = '<tr><td colspan="6">Ошибка связи</td></tr>';
  });
}

// Экспорт в Excel (CSV)
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
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи');
  });
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
  employeeSelect.addEventListener('change', onEmployeeChange);
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
