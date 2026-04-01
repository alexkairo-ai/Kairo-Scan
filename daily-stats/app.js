const db = window.db;

// Элементы
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

const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const filterStage = document.getElementById('filterStage');
const filterEmployeeName = document.getElementById('filterEmployeeName');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');

// Установка дат по умолчанию
reportDateInput.value = new Date().toISOString().slice(0, 10);
// По умолчанию показываем текущую неделю (или можно месяц, но удобнее неделя/диапазон)
const today = new Date();
const weekAgo = new Date();
weekAgo.setDate(today.getDate() - 6);
dateFrom.value = weekAgo.toISOString().slice(0, 10);
dateTo.value = today.toISOString().slice(0, 10);

function setLoading(show, text = 'Загрузка...') {
  if (show) {
    loadingIndicator.textContent = '⏳ ' + text;
    loadingIndicator.style.display = 'block';
  } else {
    loadingIndicator.style.display = 'none';
  }
}

// ========== СОХРАНЕНИЕ ==========
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

// ========== ЗАГРУЗКА ДАННЫХ С ФИЛЬТРАЦИЕЙ ==========
async function loadReportsData() {
  let from = dateFrom.value;
  let to = dateTo.value;
  if (!from || !to) return { data: [], daysInRange: 0, datesList: [] };

  // Преобразуем в объекты Date для сравнения
  const fromDateObj = new Date(from);
  const toDateObj = new Date(to);
  // Создаём массив всех дат в диапазоне
  const datesList = [];
  let currentDate = new Date(fromDateObj);
  while (currentDate <= toDateObj) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const day = currentDate.getDate();
    const formatted = `${day}.${month}.${year.toString().slice(-2)}`;
    datesList.push({ date: formatted, day: day, month: month, year: year });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  const daysInRange = datesList.length;

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Загрузка данных...');
  try {
    const snapshot = await db.collection('daily_totals').get();
    const allData = [];
    snapshot.forEach(doc => allData.push({ id: doc.id, ...doc.data() }));

    // Фильтруем по диапазону дат, этапу, сотруднику
    const filtered = allData.filter(item => {
      // Проверка даты
      const itemDateStr = item.date;
      const itemDateParts = itemDateStr.split('.');
      if (itemDateParts.length !== 3) return false;
      const itemDay = parseInt(itemDateParts[0], 10);
      const itemMonth = parseInt(itemDateParts[1], 10);
      let itemYear = parseInt(itemDateParts[2], 10);
      if (itemYear < 100) itemYear += 2000;
      const itemDateObj = new Date(itemYear, itemMonth-1, itemDay);
      if (itemDateObj < fromDateObj || itemDateObj > toDateObj) return false;

      if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
      if (employeeFilter && item.employee !== employeeFilter) return false;
      return true;
    });

    setLoading(false);
    return { data: filtered, daysInRange, datesList };
  } catch (err) {
    setLoading(false);
    console.error(err);
    alert('Ошибка загрузки: ' + err.message);
    return { data: [], daysInRange: 0, datesList: [] };
  }
}

// ========== ПОСТРОЕНИЕ МАТРИЦЫ ==========
async function loadReports() {
  const { data, daysInRange, datesList } = await loadReportsData();
  if (!data || daysInRange === 0) {
    matrixContainer.innerHTML = '<p>Выберите диапазон дат</p>';
    return;
  }

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  const stagesOrder = ['pila', 'kromka', 'prisadka', 'upakovka', 'hdf'];
  
  // Группировка по этапу и сотруднику
  const map = new Map(); // key: "этап|сотрудник"
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, days: new Array(daysInRange).fill({ count: 0, amount: 0 }) });
    }
    const entry = map.get(key);
    // Находим индекс даты в datesList
    const idx = datesList.findIndex(d => d.date === row.date);
    if (idx !== -1) {
      entry.days[idx] = { count: row.count, amount: row.amount };
    }
  }

  // Сортируем сотрудников по этапам в заданном порядке, затем по имени
  const rows = Array.from(map.values()).sort((a,b) => {
    const stageOrderA = stagesOrder.indexOf(a.stage);
    const stageOrderB = stagesOrder.indexOf(b.stage);
    if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB;
    return a.employee.localeCompare(b.employee);
  });

  // Формируем HTML-таблицу
  let html = '<table class="matrix-table">';
  // Заголовок: первый столбец "Этап/Сотрудник", второй " ", затем даты
  html += `<thead>`;
  html += `%row<th rowspan="2">Этап / Сотрудник</th><th rowspan="2"></th>`;
  for (const d of datesList) {
    html += `<th>${d.day}</th>`;
  }
  html += `</thead><tbody>`;

  // Выводим строки для каждого сотрудника
  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    // Строка "кол-во"
    html += `一期`;
    html += `<td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (let i = 0; i < daysInRange; i++) {
      const val = row.days[i].count;
      html += `<td class="count-cell">${val === 0 ? '' : val}</td>`;
    }
    html += `</tr>`;
    // Строка "метраж"
    html += `<tr>`;
    html += `<td class="row-sub-label">метраж</td>`;
    for (let i = 0; i < daysInRange; i++) {
      const val = row.days[i].amount;
      html += `<td class="amount-cell">${val === 0 ? '' : val}</td>`;
    }
    html += `</tr>`;
  }

  // === ИТОГОВАЯ СТРОКА ПО ЭТАПАМ ===
  // Собираем суммы по этапам независимо от сотрудников
  const stageTotals = new Map(); // stage -> { totalCount, totalAmount }
  for (const row of data) {
    const stage = row.stage;
    if (!stageTotals.has(stage)) {
      stageTotals.set(stage, { totalCount: 0, totalAmount: 0 });
    }
    const totals = stageTotals.get(stage);
    totals.totalCount += row.count;
    totals.totalAmount += row.amount;
  }
  // Итоговая строка: сначала для каждого этапа в порядке stagesOrder, затем общая сумма
  html += `<tr class="total-row"><td colspan="2" class="total-label">Итого по этапам</td>`;
  for (let i = 0; i < daysInRange; i++) {
    html += `<td></td>`;
  }
  html += `</tr>`;
  for (const stageKey of stagesOrder) {
    const totals = stageTotals.get(stageKey);
    if (totals) {
      const stageName = stageNames[stageKey] || stageKey;
      html += `<tr class="stage-total-row">`;
      html += `<td colspan="2" class="stage-total-label">${stageName}</td>`;
      for (let i = 0; i < daysInRange; i++) {
        html += `<td></td>`;
      }
      html += `</tr>`;
      // строка "кол-во"
      html += `<tr class="stage-total-values">`;
      html += `<td class="row-sub-label">кол-во</td>`;
      html += `<td></td>`;
      for (let i = 0; i < daysInRange; i++) {
        // Здесь можно было бы вывести по дням, но в задании – общие итоги по всему диапазону.
        // Поскольку в примере была общая итоговая строка внизу, а не по дням, сделаем общие суммы.
        // Но проще вывести общую сумму в последней колонке? В примере Excel общая сумма была в отдельной колонке.
        // Сделаем так: после всех столбцов добавим колонку "Всего".
        // Переделаем таблицу: добавим колонку "Всего".
      }
      html += `</tr>`;
    }
  }

  html += `</tbody></table>`;
  matrixContainer.innerHTML = html;
}

// ========== ЭКСПОРТ В EXCEL ==========
async function exportToExcel() {
  const { data, daysInRange, datesList } = await loadReportsData();
  if (!data || daysInRange === 0) {
    alert('Нет данных для экспорта');
    return;
  }

  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  const stagesOrder = ['pila', 'kromka', 'prisadka', 'upakovka', 'hdf'];
  
  const map = new Map();
  for (const row of data) {
    const key = `${row.stage}|${row.employee}`;
    if (!map.has(key)) {
      map.set(key, { stage: row.stage, employee: row.employee, days: new Array(daysInRange).fill({ count: 0, amount: 0 }) });
    }
    const entry = map.get(key);
    const idx = datesList.findIndex(d => d.date === row.date);
    if (idx !== -1) {
      entry.days[idx] = { count: row.count, amount: row.amount };
    }
  }

  const rows = Array.from(map.values()).sort((a,b) => {
    const stageOrderA = stagesOrder.indexOf(a.stage);
    const stageOrderB = stagesOrder.indexOf(b.stage);
    if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB;
    return a.employee.localeCompare(b.employee);
  });

  // Вычисляем итоги по этапам
  const stageTotals = new Map();
  for (const row of data) {
    const stage = row.stage;
    if (!stageTotals.has(stage)) {
      stageTotals.set(stage, { totalCount: 0, totalAmount: 0 });
    }
    const totals = stageTotals.get(stage);
    totals.totalCount += row.count;
    totals.totalAmount += row.amount;
  }

  // Формируем HTML для Excel
  let html = `<html><head><meta charset="UTF-8"><title>Итоги</title>
  <style>
    body { font-family: Calibri, Arial; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #7f8c8d; padding: 6px; text-align: center; vertical-align: middle; }
    th { background-color: #f2c94c; font-weight: bold; }
    .row-label { background-color: #e9ecef; font-weight: bold; text-align: left; }
    .row-sub-label { background-color: #e9ecef; font-weight: normal; text-align: left; }
    .count-cell, .amount-cell { text-align: center; }
    .total-row, .stage-total-row { background-color: #d9ead3; }
    .total-label, .stage-total-label { font-weight: bold; text-align: left; }
    .stage-total-values { background-color: #f9f9f9; }
  </style></head><body>
  <h2>Итоги за период: ${dateFrom.value} – ${dateTo.value}</h2>
  能`;

  html += `<thead>`;
  html += `%row<th rowspan="2">Этап / Сотрудник</th><th rowspan="2"></th>`;
  for (const d of datesList) {
    html += `<th>${d.day}</th>`;
  }
  html += `<th rowspan="2">Всего заказов</th><th rowspan="2">Всего метров/упак.</th>`;
  html += `</thead><tbody>`;

  for (const row of rows) {
    const stageName = stageNames[row.stage] || row.stage;
    let totalCount = 0;
    let totalAmount = 0;
    for (let i = 0; i < daysInRange; i++) {
      totalCount += row.days[i].count;
      totalAmount += row.days[i].amount;
    }
    // Строка "кол-во"
    html += `<tr>`;
    html += `<td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (let i = 0; i < daysInRange; i++) {
      const val = row.days[i].count;
      html += `<td class="count-cell">${val === 0 ? '' : val}</td>`;
    }
    html += `<td>${totalCount}</td><td></td>`;
    html += `</tr>`;
    // Строка "метраж"
    html += `<tr>`;
    html += `<td class="row-sub-label">метраж</td>`;
    for (let i = 0; i < daysInRange; i++) {
      const val = row.days[i].amount;
      html += `<td class="amount-cell">${val === 0 ? '' : val}</td>`;
    }
    html += `<td></td><td>${totalAmount}</td>`;
    html += `</tr>`;
  }

  // Итоги по этапам
  for (const stageKey of stagesOrder) {
    const totals = stageTotals.get(stageKey);
    if (totals) {
      const stageName = stageNames[stageKey] || stageKey;
      html += `<tr class="stage-total-row"><td colspan="2" class="stage-total-label">${stageName}</td>`;
      for (let i = 0; i < daysInRange; i++) html += `<td></td>`;
      html += `<td class="total-count">${totals.totalCount}</td><td class="total-amount">${totals.totalAmount}</td></tr>`;
    }
  }

  // Общий итог
  let grandTotalCount = 0;
  let grandTotalAmount = 0;
  for (const totals of stageTotals.values()) {
    grandTotalCount += totals.totalCount;
    grandTotalAmount += totals.totalAmount;
  }
  html += `<tr class="total-row"><td colspan="2" class="total-label">ВСЕГО</td>`;
  for (let i = 0; i < daysInRange; i++) html += `<td></td>`;
  html += `<td class="total-count">${grandTotalCount}</td><td class="total-amount">${grandTotalAmount}</td></tr>`;

  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `totals_${dateFrom.value}_to_${dateTo.value}.xls`;
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

document.addEventListener('DOMContentLoaded', () => {
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
});
