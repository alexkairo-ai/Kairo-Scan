const db = window.db;

// DOM элементы
const loadingIndicator = document.getElementById('loadingIndicator');
const reportDateInput = document.getElementById('reportDate');
const employeeNameInput = document.getElementById('employeeName');
const stageSelect = document.getElementById('stageSelect');
const orderCountInput = document.getElementById('orderCount');
const totalAmountInput = document.getElementById('totalAmount');
const saveBtn = document.getElementById('saveBtn');

const tabInput = document.getElementById('tabInput');
const tabReports = document.getElementById('tabReports');
const inputPanel = document.getElementById('inputPanel');
const reportsPanel = document.getElementById('reportsPanel');

const filterDateFrom = document.getElementById('filterDateFrom');
const filterDateTo = document.getElementById('filterDateTo');
const filterStage = document.getElementById('filterStage');
const filterEmployeeName = document.getElementById('filterEmployeeName');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');

// Запоминаем имя сотрудника в localStorage
const STORAGE_KEY = 'daily_totals_employee_name';
const savedName = localStorage.getItem(STORAGE_KEY);
if (savedName) employeeNameInput.value = savedName;
employeeNameInput.addEventListener('change', () => {
  localStorage.setItem(STORAGE_KEY, employeeNameInput.value.trim());
});

// Установка дат по умолчанию
reportDateInput.value = new Date().toISOString().slice(0, 10);
const today = new Date();
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate() - 7);
filterDateFrom.value = weekAgo.toISOString().slice(0, 10);
filterDateTo.value = today.toISOString().slice(0, 10);

function setLoading(show, text = 'Загрузка...') {
  if (show) {
    loadingIndicator.textContent = '⏳ ' + text;
    loadingIndicator.style.display = 'block';
  } else {
    loadingIndicator.style.display = 'none';
  }
}

// Сохранение итогов (всегда добавляем новую запись)
async function saveTotals() {
  const date = reportDateInput.value;
  const employee = employeeNameInput.value.trim();
  const stage = stageSelect.value;
  const count = parseInt(orderCountInput.value) || 0;
  const amount = parseFloat(totalAmountInput.value) || 0;

  if (!date) { alert('Выберите дату'); return; }
  if (!employee) { alert('Введите имя сотрудника'); return; }
  if (!stage) { alert('Выберите этап'); return; }

  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year.slice(-2)}`;

  setLoading(true, 'Сохранение...');
  try {
    await db.collection('daily_totals').add({
      date: formattedDate,
      employee: employee,
      stage: stage,
      count: count,
      amount: amount,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    setLoading(false);
    alert('Итоги сохранены!');
    orderCountInput.value = '0';
    totalAmountInput.value = '0';
  } catch (err) {
    setLoading(false);
    alert('Ошибка сохранения: ' + err.message);
  }
}

// Получение данных за период
async function loadReportsData() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) {
    alert('Выберите период');
    return { data: [], days: [] };
  }

  const fromDate = new Date(fromDateStr);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(toDateStr);
  toDate.setHours(23, 59, 59, 999);

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Загрузка данных...');
  try {
    const snapshot = await db.collection('daily_totals').get();
    const allData = [];
    snapshot.forEach(doc => allData.push({ id: doc.id, ...doc.data() }));

    const filtered = allData.filter(item => {
      const itemDate = parseDateString(item.date);
      if (!itemDate) return false;
      if (itemDate < fromDate || itemDate > toDate) return false;
      if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
      if (employeeFilter && item.employee !== employeeFilter) return false;
      return true;
    });

    // Генерируем список всех дней в периоде
    const days = [];
    let current = new Date(fromDate);
    while (current <= toDate) {
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const day = current.getDate();
      days.push(`${year}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`);
      current.setDate(current.getDate() + 1);
    }

    setLoading(false);
    return { data: filtered, days };
  } catch (err) {
    setLoading(false);
    console.error(err);
    alert('Ошибка загрузки: ' + err.message);
    return { data: [], days: [] };
  }
}

// Формирование HTML таблицы
async function loadReports() {
  const { data, days } = await loadReportsData();
  if (!data || !days || days.length === 0) {
    matrixContainer.innerHTML = '<p>Нет данных за выбранный период</p>';
    return;
  }

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  
  // Группировка по (этап, сотрудник)
  const map = new Map();
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, dayValues: {} });
    }
    const entry = map.get(key);
    const dateKey = formatDateKey(row.date);
    entry.dayValues[dateKey] = { count: row.count, amount: row.amount };
  }

  const rows = Array.from(map.values()).sort((a,b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  // Подсчёт итогов по этапам (общие суммы за период)
  const stageTotals = new Map();
  for (const row of rows) {
    let totalCount = 0, totalAmount = 0;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      totalCount += val.count;
      totalAmount += val.amount;
    }
    const stageTotal = stageTotals.get(row.stage) || { totalCount: 0, totalAmount: 0 };
    stageTotal.totalCount += totalCount;
    stageTotal.totalAmount += totalAmount;
    stageTotals.set(row.stage, stageTotal);
  }

  // Заголовок: месяц и год, если период в пределах одного месяца? Можно просто показать диапазон.
  // Но для красоты оставим числа.
  const headerDates = days.map(d => {
    const [year, month, day] = d.split('-');
    return `${day}.${month}`;
  });

  let html = '<table class="matrix-table">';
  html += `<thead>`;
  // Первая строка: объединённая ячейка для этап/сотрудник и две колонки подписей (кол-во/метраж)
  // Но в вашем примере была одна строка заголовка с числами, а месяц над ними. Сделаем так:
  // Верхняя строка: пустая ячейка, пустая, затем объединённая ячейка с месяцем и годом.
  // Для простоты опустим месяц, оставим только числа.
  html += `<tr><th rowspan="2">Этап / Сотрудник</th><th rowspan="2"></th>`;
  for (let i = 0; i < days.length; i++) {
    html += `<th colspan="1">${headerDates[i]}</th>`;
  }
  html += `<th colspan="2">Итого по сотруднику</th></tr>`;
  html += `<tr>`;
  for (let i = 0; i < days.length; i++) {
    html += `<th>${days[i].split('-')[2]}</th>`;
  }
  html += `<th>кол-во</th><th>метраж</th></tr>`;
  html += `</thead><tbody>`;

  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    let totalCount = 0, totalAmount = 0;
    // Строка "кол-во"
    html += `<tr>`;
    html += `<td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      totalCount += val.count;
      html += `<td class="count-cell">${val.count === 0 ? '' : val.count}</td>`;
    }
    html += `<td class="count-cell">${totalCount === 0 ? '' : totalCount}</td>`;
    html += `<td class="count-cell"></td>`;
    html += `</tr>`;
    // Строка "метраж"
    html += `<tr>`;
    html += `<td class="row-sub-label">метраж</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      totalAmount += val.amount;
      html += `<td class="amount-cell">${val.amount === 0 ? '' : val.amount}</td>`;
    }
    html += `<td class="amount-cell"></td>`;
    html += `<td class="amount-cell">${totalAmount === 0 ? '' : totalAmount}</td>`;
    html += `</tr>`;
  }

  // Итоговые строки по этапам
  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageName = stageNames[stageKey] || stageKey;
    html += `<tr><td colspan="2" class="row-label" style="background: #3a3a46;">${stageName} (всего)</td>`;
    for (let i = 0; i < days.length; i++) {
      html += `<td></td>`;
    }
    html += `<td class="count-cell">${totals.totalCount === 0 ? '' : totals.totalCount}</td>`;
    html += `<td class="amount-cell">${totals.totalAmount === 0 ? '' : totals.totalAmount}</td>`;
    html += `</tr>`;
  }

  html += `</tbody></table>`;
  matrixContainer.innerHTML = html;
}

// Экспорт в Excel (аналогично)
async function exportToExcel() {
  const { data, days } = await loadReportsData();
  if (!data || !days || days.length === 0) {
    alert('Нет данных за выбранный период');
    return;
  }

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  const map = new Map();
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, dayValues: {} });
    }
    const entry = map.get(key);
    const dateKey = formatDateKey(row.date);
    entry.dayValues[dateKey] = { count: row.count, amount: row.amount };
  }

  const rows = Array.from(map.values()).sort((a,b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const stageTotals = new Map();
  for (const row of rows) {
    let totalCount = 0, totalAmount = 0;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      totalCount += val.count;
      totalAmount += val.amount;
    }
    const stageTotal = stageTotals.get(row.stage) || { totalCount: 0, totalAmount: 0 };
    stageTotal.totalCount += totalCount;
    stageTotal.totalAmount += totalAmount;
    stageTotals.set(row.stage, stageTotal);
  }

  const headerDates = days.map(d => {
    const [year, month, day] = d.split('-');
    return `${day}.${month}`;
  });

  let html = `<html><head><meta charset="UTF-8"><title>Итоги</title>
  <style>
    body { font-family: Calibri, Arial; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #7f8c8d; padding: 6px; text-align: center; vertical-align: middle; }
    th { background-color: #f2c94c; font-weight: bold; }
    .row-label { background-color: #e9ecef; font-weight: bold; text-align: left; }
    .row-sub-label { background-color: #e9ecef; font-weight: normal; text-align: left; }
  </style></head><body>
  <h2>Итоги за период: ${filterDateFrom.value} — ${filterDateTo.value}</h2>
  <table>
    <thead>
      <tr><th rowspan="2">Этап / Сотрудник</th><th rowspan="2"></th>`;
  for (let i = 0; i < days.length; i++) {
    html += `<th colspan="1">${headerDates[i]}</th>`;
  }
  html += `<th colspan="2">Итого по сотруднику</th></tr><tr>`;
  for (let i = 0; i < days.length; i++) {
    html += `<th>${days[i].split('-')[2]}</th>`;
  }
  html += `<th>кол-во</th><th>метраж</th></tr></thead><tbody>`;

  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    let totalCount = 0, totalAmount = 0;
    html += `<tr><td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      totalCount += val.count;
      html += `<td class="count-cell">${val.count === 0 ? '' : val.count}</td>`;
    }
    html += `<td class="count-cell">${totalCount === 0 ? '' : totalCount}</td><td class="count-cell"></td></tr>`;
    html += `<tr><td class="row-sub-label">метраж</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      totalAmount += val.amount;
      html += `<td class="amount-cell">${val.amount === 0 ? '' : val.amount}</td>`;
    }
    html += `<td class="amount-cell"></td><td class="amount-cell">${totalAmount === 0 ? '' : totalAmount}</td></tr>`;
  }

  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageName = stageNames[stageKey] || stageKey;
    html += `<tr><td colspan="2" class="row-label">${stageName} (всего)</td>`;
    for (let i = 0; i < days.length; i++) html += `<td></td>`;
    html += `<td class="count-cell">${totals.totalCount === 0 ? '' : totals.totalCount}</td>`;
    html += `<td class="amount-cell">${totals.totalAmount === 0 ? '' : totals.totalAmount}</td></tr>`;
  }

  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `totals_${filterDateFrom.value}_${filterDateTo.value}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

// Вспомогательные функции
function parseDateString(dateStr) {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
}

function formatDateKey(dateStr) {
  const d = parseDateString(dateStr);
  if (!d) return null;
  return d.toISOString().slice(0,10);
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

function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
});
