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

// ========== СОХРАНЕНИЕ / ОБНОВЛЕНИЕ ==========
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
    const snapshot = await db.collection('daily_totals')
      .where('date', '==', formattedDate)
      .where('employee', '==', employee)
      .where('stage', '==', stage)
      .get();

    if (!snapshot.empty) {
      const docId = snapshot.docs[0].id;
      await db.collection('daily_totals').doc(docId).update({
        count: count,
        amount: amount,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
      alert('Данные обновлены');
    } else {
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

// ========== ЗАГРУЗКА ВСЕХ ДАННЫХ ИЗ FIRESTORE ==========
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

// Генерация списка дней в формате DD.MM.YY между двумя датами (включительно)
function generateDateRange(fromDateStr, toDateStr) {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  const days = [];
  let current = new Date(from);
  while (current <= to) {
    const day = current.getDate().toString().padStart(2, '0');
    const month = (current.getMonth() + 1).toString().padStart(2, '0');
    const year = current.getFullYear().toString().slice(-2);
    days.push(`${day}.${month}.${year}`);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// Форматирование заголовка для отображения: из DD.MM.YY -> DD.MM
function formatHeaderFromDateStr(dateStr) {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}.${parts[1]}`;
}

// ========== ОСНОВНАЯ ФУНКЦИЯ ОТОБРАЖЕНИЯ ==========
async function loadReports() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) {
    alert('Выберите период');
    return;
  }

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Загрузка данных...');
  const allData = await loadAllData();
  if (!allData.length) {
    setLoading(false);
    matrixContainer.innerHTML = '<p>Нет данных</p>';
    return;
  }

  // Генерируем список дней в формате DD.MM.YY
  const days = generateDateRange(fromDateStr, toDateStr);

  // Фильтруем данные по периоду, этапу, сотруднику
  let filtered = allData.filter(item => {
    if (!days.includes(item.date)) return false;
    if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
    if (employeeFilter && item.employee !== employeeFilter) return false;
    return true;
  });

  // Получаем все уникальные комбинации (этап, сотрудник) из отфильтрованных данных
  const combinations = new Map();
  for (const item of filtered) {
    const key = `${item.stage}|${item.employee}`;
    if (!combinations.has(key)) {
      combinations.set(key, { stage: item.stage, employee: item.employee, daysMap: {} });
    }
    const entry = combinations.get(key);
    entry.daysMap[item.date] = { count: item.count, amount: item.amount };
  }

  // Преобразуем в массив и сортируем
  let rows = Array.from(combinations.values());
  rows.sort((a, b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  // Подсчёт итогов по сотрудникам и этапам
  const stageTotals = new Map();
  for (const row of rows) {
    let employeeTotalCount = 0, employeeTotalAmount = 0;
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      employeeTotalCount += val.count;
      employeeTotalAmount += val.amount;
    }
    row.employeeTotalCount = employeeTotalCount;
    row.employeeTotalAmount = employeeTotalAmount;
    if (!stageTotals.has(row.stage)) {
      stageTotals.set(row.stage, { totalCount: 0, totalAmount: 0 });
    }
    const st = stageTotals.get(row.stage);
    st.totalCount += employeeTotalCount;
    st.totalAmount += employeeTotalAmount;
  }

  const stageNames = {
    pila: 'Пила',
    kromka: 'Кромка',
    prisadka: 'Присадка',
    upakovka: 'Упаковка',
    hdf: 'Пила ХДФ'
  };

  // Строим HTML-таблицу
  let html = '<table class="matrix-table"><thead><tr>';
  html += '<th>Этап / Сотрудник</th>';
  for (const d of days) {
    html += `<th>${formatHeaderFromDateStr(d)}</th>`;
  }
  html += '<th>Итого</th>';
  html += '</table></thead><tbody>';

  for (const row of rows) {
    const stageDisplay = stageNames[row.stage] || row.stage;
    // Строка "кол-во"
    html += '<tr>';
    html += `<td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td>`;
    html += '<td class="row-sub-label">кол-во</td>';
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      const countDisplay = val.count === 0 ? '' : val.count;
      html += `<td class="count-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="count">${countDisplay}</td>`;
    }
    const totalCountDisplay = row.employeeTotalCount === 0 ? '' : row.employeeTotalCount;
    html += `<td class="count-cell">${totalCountDisplay}</td>`;
    html += '</tr>';

    // Строка "метраж"
    html += '<tr>';
    html += '<td class="row-sub-label">метраж</td>';
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      const amountDisplay = val.amount === 0 ? '' : val.amount;
      html += `<td class="amount-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="amount">${amountDisplay}</td>`;
    }
    const totalAmountDisplay = row.employeeTotalAmount === 0 ? '' : row.employeeTotalAmount;
    html += `<td class="amount-cell">${totalAmountDisplay}</td>`;
    html += '</tr>';
  }

  // Итоговые строки по этапам
  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    html += '<tr>';
    html += `<td colspan="2" class="row-label" style="background:#3a3a46;">${stageDisplay} (всего)</td>`;
    for (let i = 0; i < days.length; i++) {
      html += '<td></td>';
    }
    html += `<td class="count-cell">${totals.totalCount === 0 ? '' : totals.totalCount}</td>`;
    html += '</tr>';
    html += '<tr>';
    html += `<td colspan="2" class="row-label" style="background:#3a3a46;"></td>`;
    for (let i = 0; i < days.length; i++) {
      html += '<td></td>';
    }
    html += `<td class="amount-cell">${totals.totalAmount === 0 ? '' : totals.totalAmount}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  matrixContainer.innerHTML = html;
  attachEditHandlers();
  setLoading(false);
}

// ========== РЕДАКТИРОВАНИЕ ЯЧЕЕК ==========
function attachEditHandlers() {
  const cells = document.querySelectorAll('.count-cell, .amount-cell');
  cells.forEach(cell => {
    if (cell.hasAttribute('data-stage')) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', async (e) => {
        e.stopPropagation();
        const stage = cell.dataset.stage;
        const employee = cell.dataset.employee;
        const dateStr = cell.dataset.date; // формат DD.MM.YY
        const field = cell.dataset.field;
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
        setLoading(true, 'Обновление...');
        try {
          const snapshot = await db.collection('daily_totals')
            .where('date', '==', dateStr)
            .where('employee', '==', employee)
            .where('stage', '==', stage)
            .get();
          if (snapshot.empty) {
            const newDoc = {
              date: dateStr,
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
          await loadReports();
        } catch (err) {
          alert('Ошибка: ' + err.message);
        } finally {
          setLoading(false);
        }
      });
    }
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

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Подготовка экспорта...');
  const allData = await loadAllData();
  if (!allData.length) {
    setLoading(false);
    alert('Нет данных');
    return;
  }

  const days = generateDateRange(fromDateStr, toDateStr);
  let filtered = allData.filter(item => {
    if (!days.includes(item.date)) return false;
    if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
    if (employeeFilter && item.employee !== employeeFilter) return false;
    return true;
  });

  const combinations = new Map();
  for (const item of filtered) {
    const key = `${item.stage}|${item.employee}`;
    if (!combinations.has(key)) {
      combinations.set(key, { stage: item.stage, employee: item.employee, daysMap: {} });
    }
    const entry = combinations.get(key);
    entry.daysMap[item.date] = { count: item.count, amount: item.amount };
  }

  let rows = Array.from(combinations.values());
  rows.sort((a, b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const stageNames = {
    pila: 'Пила',
    kromka: 'Кромка',
    prisadka: 'Присадка',
    upakovka: 'Упаковка',
    hdf: 'Пила ХДФ'
  };

  // Подсчёт итогов
  for (const row of rows) {
    let empCount = 0, empAmount = 0;
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      empCount += val.count;
      empAmount += val.amount;
    }
    row.empCount = empCount;
    row.empAmount = empAmount;
  }

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
    <th>Этап / Сотрудник</th>`;
  for (const d of days) {
    html += `<th>${formatHeaderFromDateStr(d)}</th>`;
  }
  html += `<th>Итого</th></tr></thead><tbody>`;

  for (const row of rows) {
    const stageDisplay = stageNames[row.stage] || row.stage;
    html += `<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td>`;
    html += `<td class="row-sub-label">кол-во</td>`;
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      html += `<td>${val.count === 0 ? '' : val.count}</td>`;
    }
    html += `<td>${row.empCount === 0 ? '' : row.empCount}</td></tr>`;
    html += `<tr><td class="row-sub-label">метраж</td>`;
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      html += `<td>${val.amount === 0 ? '' : val.amount}</td>`;
    }
    html += `<td>${row.empAmount === 0 ? '' : row.empAmount}</td></tr>`;
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
