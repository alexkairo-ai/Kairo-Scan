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

const reportMonth = document.getElementById('reportMonth');
const filterStage = document.getElementById('filterStage');
const filterEmployeeName = document.getElementById('filterEmployeeName');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');

// Установка дат по умолчанию
reportDateInput.value = new Date().toISOString().slice(0, 10);
reportMonth.value = new Date().toISOString().slice(0, 7);

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

  // Формат даты для хранения: DD.MM.YY
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

// ========== ЗАГРУЗКА ДАННЫХ ИЗ FIRESTORE ==========
async function loadReportsData() {
  const month = reportMonth.value;
  if (!month) return [];
  const [year, monthNum] = month.split('-');
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Загрузка данных...');
  try {
    const snapshot = await db.collection('daily_totals').get();
    const allData = [];
    snapshot.forEach(doc => allData.push({ id: doc.id, ...doc.data() }));

    // Фильтрация на клиенте (по дате, этапу, сотруднику)
    const filtered = allData.filter(item => {
      // Проверка даты
      const itemDateParts = item.date.split('.');
      if (itemDateParts.length !== 3) return false;
      const itemDay = parseInt(itemDateParts[0], 10);
      const itemMonth = parseInt(itemDateParts[1], 10);
      let itemYear = parseInt(itemDateParts[2], 10);
      if (itemYear < 100) itemYear += 2000;
      const itemDateObj = new Date(itemYear, itemMonth-1, itemDay);
      const fromDateObj = new Date(year, monthNum-1, 1);
      const toDateObj = new Date(year, monthNum, 0);
      if (itemDateObj < fromDateObj || itemDateObj > toDateObj) return false;

      if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
      if (employeeFilter && item.employee !== employeeFilter) return false;
      return true;
    });

    setLoading(false);
    return { data: filtered, daysInMonth };
  } catch (err) {
    setLoading(false);
    console.error(err);
    alert('Ошибка загрузки: ' + err.message);
    return { data: [], daysInMonth: 0 };
  }
}

// ========== ОТОБРАЖЕНИЕ МАТРИЦЫ ==========
async function loadReports() {
  const { data, daysInMonth } = await loadReportsData();
  if (!data) return;

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  
  const map = new Map();
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, days: new Array(daysInMonth).fill({ count: 0, amount: 0 }) });
    }
    const entry = map.get(key);
    const day = parseInt(row.date.split('.')[0]) - 1;
    if (day >= 0 && day < daysInMonth) {
      entry.days[day] = { count: row.count, amount: row.amount };
    }
  }

  const rows = Array.from(map.values()).sort((a,b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const [year, monthNum] = reportMonth.value.split('-');
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const monthName = monthNames[parseInt(monthNum)-1];

  let html = '<table class="matrix-table">';
  html += `<thead><tr><th rowspan="2" style="vertical-align:middle;">Этап / Сотрудник</th><th colspan="${daysInMonth}">${monthName} ${year}</th>`;
  html += `</thead><tbody>`;
  html += `一期<th>Кол-во</th>`;
  for (let d = 1; d <= daysInMonth; d++) html += `<th>${d}</th>`;
  html += `</tr>`;
  html += `<tr><th>Метраж</th>`;
  for (let d = 1; d <= daysInMonth; d++) html += `<th></th>`;
  html += `</tr>`;

  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    html += `<tr><td class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    for (let d = 0; d < daysInMonth; d++) html += `<td class="count-cell">${row.days[d].count}</td>`;
    html += `</tr><tr><td class="row-label"></td>`;
    for (let d = 0; d < daysInMonth; d++) html += `<td class="amount-cell">${row.days[d].amount}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  matrixContainer.innerHTML = html;
}

// ========== ЭКСПОРТ В EXCEL ==========
async function exportToExcel() {
  const { data, daysInMonth } = await loadReportsData();
  if (!data) return;

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  const map = new Map();
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, days: new Array(daysInMonth).fill({ count: 0, amount: 0 }) });
    }
    const entry = map.get(key);
    const day = parseInt(row.date.split('.')[0]) - 1;
    if (day >= 0 && day < daysInMonth) {
      entry.days[day] = { count: row.count, amount: row.amount };
    }
  }

  const rows = Array.from(map.values()).sort((a,b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const [year, monthNum] = reportMonth.value.split('-');
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const monthName = monthNames[parseInt(monthNum)-1];

  let html = `<html><head><meta charset="UTF-8"><title>Итоги за ${reportMonth.value}</title>
  <style>
    body { font-family: Calibri, Arial; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #7f8c8d; padding: 6px; text-align: center; vertical-align: middle; }
    th { background-color: #f2c94c; font-weight: bold; }
    .row-label { background-color: #e9ecef; font-weight: bold; text-align: left; }
  </style></head><body>
  <h2>Итоги за ${reportMonth.value}</h2>
  <table>
    <thead>
      <tr><th rowspan="2">Этап / Сотрудник</th><th colspan="${daysInMonth}">${monthName} ${year}</th></tr>
      <tr>`;
  for (let d = 1; d <= daysInMonth; d++) html += `<th>${d}</th>`;
  html += `</tr></thead><tbody>`;

  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    html += `<tr><td class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    for (let d = 0; d < daysInMonth; d++) html += `<td>${row.days[d].count}</td>`;
    html += `</tr><tr><td class="row-label"></td>`;
    for (let d = 0; d < daysInMonth; d++) html += `<td>${row.days[d].amount}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `totals_${reportMonth.value}.xls`;
  link.click();
  URL.revokeObjectURL(url);
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
