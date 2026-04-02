// Получаем доступ к базе данных
const db = window.db;

// Элементы DOM
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

// Установка дат по умолчанию
reportDateInput.value = new Date().toISOString().slice(0, 10);
const today = new Date();
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate() - 7);
filterDateFrom.value = weekAgo.toISOString().slice(0, 10);
filterDateTo.value = today.toISOString().slice(0, 10);

// Загрузка сохранённого имени сотрудника
const savedEmployee = localStorage.getItem('employeeName');
if (savedEmployee) employeeNameInput.value = savedEmployee;
employeeNameInput.addEventListener('change', () => {
  localStorage.setItem('employeeName', employeeNameInput.value.trim());
});

function setLoading(show, text = 'Загрузка...') {
  if (show) {
    loadingIndicator.textContent = '⏳ ' + text;
    loadingIndicator.style.display = 'block';
  } else {
    loadingIndicator.style.display = 'none';
  }
}

// ========== СОХРАНЕНИЕ В FIRESTORE ==========
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
    // Всегда добавляем новую запись, чтобы можно было суммировать за день
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

// ========== ЗАГРУЗКА ДАННЫХ ИЗ FIRESTORE ==========
async function loadReportsData() {
  let fromDateStr = filterDateFrom.value;
  let toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) {
    alert('Выберите период');
    return { data: [], days: [] };
  }

  // Устанавливаем время на начало и конец дня для корректного сравнения
  let fromDate = new Date(fromDateStr);
  fromDate.setHours(0, 0, 0, 0);
  let toDate = new Date(toDateStr);
  toDate.setHours(23, 59, 59, 999);

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Загрузка данных...');
  try {
    const snapshot = await db.collection('daily_totals').get();
    const allData = [];
    snapshot.forEach(doc => allData.push({ id: doc.id, ...doc.data() }));

    const filtered = allData.filter(item => {
      const itemDateParts = item.date.split('.');
      if (itemDateParts.length !== 3) return false;
      const itemDay = parseInt(itemDateParts[0], 10);
      const itemMonth = parseInt(itemDateParts[1], 10);
      let itemYear = parseInt(itemDateParts[2], 10);
      if (itemYear < 100) itemYear += 2000;
      const itemDateObj = new Date(itemYear, itemMonth-1, itemDay);
      itemDateObj.setHours(12, 0, 0, 0); // нейтральное время
      if (itemDateObj < fromDate || itemDateObj > toDate) return false;

      if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
      if (employeeFilter && item.employee !== employeeFilter) return false;
      return true;
    });

    // Список всех дней в периоде
    const days = [];
    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const day = currentDate.getDate();
      const dateStr = `${year}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
      days.push(dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
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

// ========== ОТОБРАЖЕНИЕ МАТРИЦЫ ==========
async function loadReports() {
  const { data, days } = await loadReportsData();
  if (!data || !days) return;

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  
  // Группируем по (этап, сотрудник)
  const map = new Map();
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, dayValues: {} });
    }
    const entry = map.get(key);
    const dateObj = parseDateString(row.date);
    const dateKey = dateObj.toISOString().slice(0,10);
    const existing = entry.dayValues[dateKey] || { count: 0, amount: 0 };
    entry.dayValues[dateKey] = {
      count: existing.count + row.count,
      amount: existing.amount + row.amount
    };
  }

  // Преобразуем в массив и сортируем: по этапу (алфавит), затем по сотруднику
  const rows = Array.from(map.values()).sort((a,b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const headerDates = days.map(d => {
    const [year, month, day] = d.split('-');
    return `${day}.${month}`;
  });

  // Подсчёт итогов по этапам
  const stageTotals = new Map();
  for (const row of rows) {
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      const total = stageTotals.get(row.stage) || { totalCount: 0, totalAmount: 0 };
      total.totalCount += val.count;
      total.totalAmount += val.amount;
      stageTotals.set(row.stage, total);
    }
  }

  // Строим HTML таблицу (одна строка заголовка с числами)
  let html = '<table class="matrix-table">';
  html += `<thead>`;
  html += `<tr><th rowspan="1">Этап / Сотрудник</th><th rowspan="1"></th>`;
  for (let i = 0; i < days.length; i++) {
    html += `<th>${headerDates[i]}<br>${days[i].split('-')[2]}</th>`;
  }
  html += `<th colspan="2">Итого по сотруднику</th>`;
  html += `</thead><tbody>`;

  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    let employeeTotalCount = 0;
    let employeeTotalAmount = 0;
    // Строка "кол-во"
    html += `<tr>`;
    html += `<td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      const countDisplay = val.count === 0 ? '' : val.count;
      html += `<td class="count-cell">${countDisplay}</td>`;
      employeeTotalCount += val.count;
    }
    html += `<td class="count-cell">${employeeTotalCount === 0 ? '' : employeeTotalCount}</td>`;
    html += `<td class="count-cell"></td>`;
    html += `</tr>`;
    // Строка "метраж"
    html += `<tr>`;
    html += `<td class="row-sub-label">метраж</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      const amountDisplay = val.amount === 0 ? '' : val.amount;
      html += `<td class="amount-cell">${amountDisplay}</td>`;
      employeeTotalAmount += val.amount;
    }
    html += `<td class="amount-cell"><td>`;
    html += `<td class="amount-cell">${employeeTotalAmount === 0 ? '' : employeeTotalAmount}</td>`;
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

// ========== ЭКСПОРТ В EXCEL ==========
async function exportToExcel() {
  const { data, days } = await loadReportsData();
  if (!data || !days) return;

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  const map = new Map();
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, dayValues: {} });
    }
    const entry = map.get(key);
    const dateObj = parseDateString(row.date);
    const dateKey = dateObj.toISOString().slice(0,10);
    const existing = entry.dayValues[dateKey] || { count: 0, amount: 0 };
    entry.dayValues[dateKey] = {
      count: existing.count + row.count,
      amount: existing.amount + row.amount
    };
  }

  const rows = Array.from(map.values()).sort((a,b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const headerDates = days.map(d => {
    const [year, month, day] = d.split('-');
    return `${day}.${month}`;
  });

  const stageTotals = new Map();
  for (const row of rows) {
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      const total = stageTotals.get(row.stage) || { totalCount: 0, totalAmount: 0 };
      total.totalCount += val.count;
      total.totalAmount += val.amount;
      stageTotals.set(row.stage, total);
    }
  }

  let html = `<html><head><meta charset="UTF-8"><title>Итоги</title>
  <style>
    body { font-family: Calibri, Arial; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #7f8c8d; padding: 6px; text-align: center; vertical-align: middle; }
    th { background-color: #f2c94c; font-weight: bold; }
    .row-label { background-color: #e9ecef; font-weight: bold; text-align: left; }
    .row-sub-label { background-color: #e9ecef; font-weight: normal; text-align: left; }
    .count-cell, .amount-cell { text-align: center; }
  </style></head><body>
  <h2>Итоги за период: ${filterDateFrom.value} — ${filterDateTo.value}</h2>
  <table>
    <thead>
      <tr><th>Этап / Сотрудник</th><th></th>`;
  for (let i = 0; i < days.length; i++) {
    html += `<th>${headerDates[i]}<br>${days[i].split('-')[2]}</th>`;
  }
  html += `<th colspan="2">Итого по сотруднику</th>`;
  html += `</thead><tbody>`;

  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    let employeeTotalCount = 0;
    let employeeTotalAmount = 0;
    html += `<tr><td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      const countDisplay = val.count === 0 ? '' : val.count;
      html += `<td class="count-cell">${countDisplay}</td>`;
      employeeTotalCount += val.count;
    }
    html += `<td class="count-cell">${employeeTotalCount === 0 ? '' : employeeTotalCount}</td>`;
    html += `<td class="count-cell"></td>`;
    html += `</tr>`;
    html += `<tr><td class="row-sub-label">метраж</td>`;
    for (const dateKey of days) {
      const val = row.dayValues[dateKey] || { count: 0, amount: 0 };
      const amountDisplay = val.amount === 0 ? '' : val.amount;
      html += `<td class="amount-cell">${amountDisplay}</td>`;
      employeeTotalAmount += val.amount;
    }
    html += `<td class="amount-cell"><td>`;
    html += `<td class="amount-cell">${employeeTotalAmount === 0 ? '' : employeeTotalAmount}</td>`;
    html += `</tr>`;
  }

  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageName = stageNames[stageKey] || stageKey;
    html += `<tr><td colspan="2" class="row-label" style="background: #e9ecef;">${stageName} (всего)</td>`;
    for (let i = 0; i < days.length; i++) {
      html += `<td></td>`;
    }
    html += `<td class="count-cell">${totals.totalCount === 0 ? '' : totals.totalCount}</td>`;
    html += `<td class="amount-cell">${totals.totalAmount === 0 ? '' : totals.totalAmount}</td>`;
    html += `</tr>`;
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

function parseDateString(dateStr) {
  const parts = dateStr.split('.');
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
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
