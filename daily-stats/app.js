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
const adminModeCheckbox = document.getElementById('adminModeCheckbox');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');

// Установка дат по умолчанию
const today = new Date();
reportDateInput.value = today.toISOString().slice(0, 10);
// Фильтр: последние 7 дней
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate() - 7);
filterDateFrom.value = weekAgo.toISOString().slice(0, 10);
filterDateTo.value = today.toISOString().slice(0, 10);

// Запоминание имени сотрудника
const savedName = localStorage.getItem('employeeName');
if (savedName) employeeNameInput.value = savedName;
employeeNameInput.addEventListener('change', () => {
  localStorage.setItem('employeeName', employeeNameInput.value.trim());
});

function setLoading(show, text = 'Загрузка...') {
  loadingIndicator.style.display = show ? 'block' : 'none';
  if (show) loadingIndicator.textContent = '⏳ ' + text;
}

// ========== СОХРАНЕНИЕ / ОБНОВЛЕНИЕ ДАННЫХ ==========
async function saveTotals() {
  const date = reportDateInput.value;
  const employee = employeeNameInput.value.trim();
  const stage = stageSelect.value;
  const count = parseInt(orderCountInput.value) || 0;
  const amount = parseFloat(totalAmountInput.value) || 0;

  if (!date || !employee || !stage) {
    alert('Заполните дату, имя и этап');
    return;
  }

  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year.slice(-2)}`;

  setLoading(true, 'Сохранение...');
  try {
    // Ищем существующую запись за этот день, сотрудника и этап
    const snapshot = await db.collection('daily_totals')
      .where('date', '==', formattedDate)
      .where('employee', '==', employee)
      .where('stage', '==', stage)
      .get();

    if (!snapshot.empty) {
      // Обновляем существующий документ
      const docId = snapshot.docs[0].id;
      await db.collection('daily_totals').doc(docId).update({
        count: count,
        amount: amount,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      alert('Данные обновлены');
    } else {
      // Создаём новую запись
      await db.collection('daily_totals').add({
        date: formattedDate,
        employee: employee,
        stage: stage,
        count: count,
        amount: amount,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      alert('Данные сохранены');
    }
    orderCountInput.value = '0';
    totalAmountInput.value = '0';
  } catch (err) {
    alert('Ошибка: ' + err.message);
  } finally {
    setLoading(false);
  }
}

// ========== ЗАГРУЗКА ДАННЫХ ДЛЯ ОТЧЁТОВ ==========
async function loadAllData() {
  try {
    const snapshot = await db.collection('daily_totals').get();
    const allData = [];
    snapshot.forEach(doc => allData.push({ id: doc.id, ...doc.data() }));
    return allData;
  } catch (err) {
    console.error(err);
    return [];
  }
}

function parseDateFromStr(dateStr) {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  return new Date(year, month, day);
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

// Получение списка всех уникальных сотрудников (из всех записей)
function getAllEmployees(data) {
  const employeesSet = new Set();
  data.forEach(item => employeesSet.add(item.employee));
  return Array.from(employeesSet).sort();
}

// Получение списка всех уникальных этапов
function getAllStages(data) {
  const stagesSet = new Set();
  data.forEach(item => stagesSet.add(item.stage));
  return Array.from(stagesSet).sort();
}

// ========== ОТОБРАЖЕНИЕ МАТРИЦЫ ==========
async function loadReports() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) {
    alert('Выберите период');
    return;
  }

  const fromDate = new Date(fromDateStr);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(toDateStr);
  toDate.setHours(23, 59, 59, 999);

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Загрузка данных...');
  const allData = await loadAllData();
  if (!allData.length) {
    setLoading(false);
    matrixContainer.innerHTML = '<p>Нет данных</p>';
    return;
  }

  // Фильтрация по дате и этапу/сотруднику
  let filtered = allData.filter(item => {
    const itemDate = parseDateFromStr(item.date);
    if (!itemDate) return false;
    if (itemDate < fromDate || itemDate > toDate) return false;
    if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
    if (employeeFilter && item.employee !== employeeFilter) return false;
    return true;
  });

  // Список всех дней в периоде
  const days = [];
  let current = new Date(fromDate);
  while (current <= toDate) {
    days.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  // Все сотрудники (из всех записей, не только за период)
  const allEmployees = getAllEmployees(allData);
  // Все этапы
  const allStages = getAllStages(allData);
  // Создаём карту: этап -> сотрудник -> объект с данными по дням
  const stageEmployeeMap = new Map(); // stage -> Map(employee -> dayValues)
  for (const stage of allStages) {
    stageEmployeeMap.set(stage, new Map());
    for (const emp of allEmployees) {
      stageEmployeeMap.get(stage).set(emp, {});
    }
  }
  // Заполняем данными из filtered
  for (const item of filtered) {
    const itemDate = parseDateFromStr(item.date);
    const dateKey = formatDateKey(itemDate);
    const empMap = stageEmployeeMap.get(item.stage);
    if (empMap && empMap.has(item.employee)) {
      empMap.get(item.employee)[dateKey] = { count: item.count, amount: item.amount };
    }
  }

  // Преобразуем в массив для отображения, сортируем по этапу, затем по имени
  const rows = [];
  for (const [stage, empMap] of stageEmployeeMap.entries()) {
    for (const [employee, dayValues] of empMap.entries()) {
      rows.push({ stage, employee, dayValues });
    }
  }
  rows.sort((a, b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  // Заголовки: только одна строка с датами
  let html = '<table class="matrix-table"><thead><tr>';
  html += '<th rowspan="1">Этап / Сотрудник</th>';
  html += '<th rowspan="1"></th>'; // пустая колонка для разделения (можно убрать)
  for (const d of days) {
    const [year, month, dayNum] = d.split('-');
    html += `<th>${dayNum}.${month}</th>`;
  }
  html += '<th>Итого</th></tr></thead><tbody>';

  for (const row of rows) {
    const stageName = getStageName(row.stage);
    let totalCount = 0;
    let totalAmount = 0;
    // Строка "кол-во"
    html += `<tr>`;
    html += `<td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (const d of days) {
      const val = row.dayValues[d] || { count: 0, amount: 0 };
      const countDisplay = val.count === 0 ? '' : val.count;
      html += `<td class="count-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="count">${countDisplay}</td>`;
      totalCount += val.count;
    }
    html += `<td class="count-cell">${totalCount === 0 ? '' : totalCount}</td>`;
    html += `</tr>`;
    // Строка "метраж"
    html += `<tr>`;
    html += `<td class="row-sub-label">метраж</td>`;
    for (const d of days) {
      const val = row.dayValues[d] || { count: 0, amount: 0 };
      const amountDisplay = val.amount === 0 ? '' : val.amount;
      html += `<td class="amount-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="amount">${amountDisplay}</td>`;
      totalAmount += val.amount;
    }
    html += `<td class="amount-cell">${totalAmount === 0 ? '' : totalAmount}</td>`;
    html += `</tr>`;
  }
  html += '</tbody></table>';
  matrixContainer.innerHTML = html;

  // Добавляем обработчики кликов для редактирования
  attachEditHandlers();
  setLoading(false);
}

function getStageName(stageKey) {
  const names = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  return names[stageKey] || stageKey;
}

// Редактирование ячейки
function attachEditHandlers() {
  const cells = document.querySelectorAll('.count-cell, .amount-cell');
  cells.forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', async (e) => {
      e.stopPropagation();
      const stage = cell.dataset.stage;
      const employee = cell.dataset.employee;
      const dateStr = cell.dataset.date; // формат YYYY-MM-DD
      const field = cell.dataset.field; // 'count' или 'amount'
      const currentValue = cell.innerText === '' ? 0 : parseFloat(cell.innerText);

      const isAdmin = adminModeCheckbox.checked;
      const currentUser = employeeNameInput.value.trim();
      if (!isAdmin && currentUser !== employee) {
        alert('Редактировать можно только свои данные (или включите режим администратора)');
        return;
      }

      const newValue = prompt(`Введите новое значение для ${field === 'count' ? 'количества заказов' : 'метража'} (текущее: ${currentValue}):`, currentValue);
      if (newValue === null) return;
      const numValue = parseFloat(newValue);
      if (isNaN(numValue)) {
        alert('Введите число');
        return;
      }

      // Формируем дату в формате DD.MM.YY для поиска в БД
      const [year, month, day] = dateStr.split('-');
      const formattedDate = `${day}.${month}.${year.slice(-2)}`;

      setLoading(true, 'Обновление...');
      try {
        const snapshot = await db.collection('daily_totals')
          .where('date', '==', formattedDate)
          .where('employee', '==', employee)
          .where('stage', '==', stage)
          .get();
        if (snapshot.empty) {
          // Если нет записи, создаём новую
          const newDoc = {
            date: formattedDate,
            employee: employee,
            stage: stage,
            count: field === 'count' ? numValue : 0,
            amount: field === 'amount' ? numValue : 0,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          };
          await db.collection('daily_totals').add(newDoc);
        } else {
          const docId = snapshot.docs[0].id;
          const updateData = {};
          if (field === 'count') updateData.count = numValue;
          else updateData.amount = numValue;
          await db.collection('daily_totals').doc(docId).update(updateData);
        }
        alert('Обновлено');
        await loadReports(); // перезагружаем отчёты
      } catch (err) {
        alert('Ошибка: ' + err.message);
      } finally {
        setLoading(false);
      }
    });
  });
}

// ========== ЭКСПОРТ В EXCEL ==========
async function exportToExcel() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) {
    alert('Выберите период');
    return;
  }

  const fromDate = new Date(fromDateStr);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(toDateStr);
  toDate.setHours(23, 59, 59, 999);

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Подготовка экспорта...');
  const allData = await loadAllData();
  if (!allData.length) {
    setLoading(false);
    alert('Нет данных');
    return;
  }

  let filtered = allData.filter(item => {
    const itemDate = parseDateFromStr(item.date);
    if (!itemDate) return false;
    if (itemDate < fromDate || itemDate > toDate) return false;
    if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
    if (employeeFilter && item.employee !== employeeFilter) return false;
    return true;
  });

  const days = [];
  let current = new Date(fromDate);
  while (current <= toDate) {
    days.push(formatDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  const allEmployees = getAllEmployees(allData);
  const allStages = getAllStages(allData);
  const stageEmployeeMap = new Map();
  for (const stage of allStages) {
    stageEmployeeMap.set(stage, new Map());
    for (const emp of allEmployees) {
      stageEmployeeMap.get(stage).set(emp, {});
    }
  }
  for (const item of filtered) {
    const itemDate = parseDateFromStr(item.date);
    const dateKey = formatDateKey(itemDate);
    const empMap = stageEmployeeMap.get(item.stage);
    if (empMap && empMap.has(item.employee)) {
      empMap.get(item.employee)[dateKey] = { count: item.count, amount: item.amount };
    }
  }

  const rows = [];
  for (const [stage, empMap] of stageEmployeeMap.entries()) {
    for (const [employee, dayValues] of empMap.entries()) {
      rows.push({ stage, employee, dayValues });
    }
  }
  rows.sort((a, b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  let html = `<html><head><meta charset="UTF-8"><title>Итоги за период</title>
  <style>
    body { font-family: Calibri, Arial; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #7f8c8d; padding: 6px; text-align: center; vertical-align: middle; }
    th { background-color: #f2c94c; font-weight: bold; }
    .row-label { background-color: #e9ecef; font-weight: bold; text-align: left; }
    .row-sub-label { background-color: #e9ecef; font-weight: normal; text-align: left; }
  </style></head><body>
  <h2>Итоги за ${fromDateStr} — ${toDateStr}</h2>
  <table><thead><tr>
    <th>Этап / Сотрудник</th><th></th>`;
  for (const d of days) {
    const [year, month, dayNum] = d.split('-');
    html += `<th>${dayNum}.${month}</th>`;
  }
  html += `<th>Итого</th></tr></thead><tbody>`;

  for (const row of rows) {
    const stageName = getStageName(row.stage);
    let totalCount = 0, totalAmount = 0;
    html += `<tr><td rowspan="2" class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (const d of days) {
      const val = row.dayValues[d] || { count: 0, amount: 0 };
      const countDisplay = val.count === 0 ? '' : val.count;
      html += `<td>${countDisplay}</td>`;
      totalCount += val.count;
    }
    html += `<td>${totalCount === 0 ? '' : totalCount}</td></tr>`;
    html += `<tr><td class="row-sub-label">метраж</td>`;
    for (const d of days) {
      const val = row.dayValues[d] || { count: 0, amount: 0 };
      const amountDisplay = val.amount === 0 ? '' : val.amount;
      html += `<td>${amountDisplay}</td>`;
      totalAmount += val.amount;
    }
    html += `<td>${totalAmount === 0 ? '' : totalAmount}</td></tr>`;
  }
  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `totals_${fromDateStr}_${toDateStr}.xls`;
  link.click();
  URL.revokeObjectURL(url);
  setLoading(false);
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
