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
const adminModeCheckbox = document.getElementById('adminModeCheckbox');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');

// Установка дат
const today = new Date();
reportDateInput.value = today.toISOString().slice(0, 10);
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

// Сохранение (обновление или создание)
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
      await db.collection('daily_totals').doc(docId).update({ count, amount, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
      alert('Данные обновлены');
    } else {
      await db.collection('daily_totals').add({ date: formattedDate, employee, stage, count, amount, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
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

// Загрузка всех данных из Firestore
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

// Генерация списка дней в формате DD.MM.YY
function generateDateRange(fromDateStr, toDateStr) {
  const fromParts = fromDateStr.split('-').map(Number);
  const toParts = toDateStr.split('-').map(Number);
  const from = new Date(fromParts[0], fromParts[1]-1, fromParts[2]);
  const to = new Date(toParts[0], toParts[1]-1, toParts[2]);
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

function formatHeader(dateStr) {
  const parts = dateStr.split('.');
  return `${parts[0]}.${parts[1]}`;
}

// Основная функция отображения отчётов
async function loadReports() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) {
    alert('Выберите период');
    return;
  }

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Загрузка...');
  const allData = await loadAllData();
  if (!allData.length) {
    setLoading(false);
    matrixContainer.innerHTML = '<p>Нет данных</p>';
    return;
  }

  const days = generateDateRange(fromDateStr, toDateStr);
  
  // Получаем ВСЕ уникальные комбинации (этап, сотрудник) из всей базы
  const allCombos = new Map(); // key: "stage|employee"
  for (const item of allData) {
    const key = `${item.stage}|${item.employee}`;
    if (!allCombos.has(key)) {
      allCombos.set(key, { stage: item.stage, employee: item.employee, daysMap: {} });
    }
  }
  
  // Заполняем daysMap данными за период
  for (const item of allData) {
    if (!days.includes(item.date)) continue;
    const key = `${item.stage}|${item.employee}`;
    if (allCombos.has(key)) {
      allCombos.get(key).daysMap[item.date] = { count: item.count, amount: item.amount };
    }
  }
  
  // Применяем фильтр по этапу и сотруднику
  let rows = Array.from(allCombos.values());
  if (stageFilter !== 'all') {
    rows = rows.filter(row => row.stage === stageFilter);
  }
  if (employeeFilter) {
    rows = rows.filter(row => row.employee === employeeFilter);
  }
  
  // Сортировка
  rows.sort((a, b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });
  
  // Подсчёт итогов по сотрудникам за период
  for (const row of rows) {
    let totalCount = 0, totalAmount = 0;
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      totalCount += val.count;
      totalAmount += val.amount;
    }
    row.totalCount = totalCount;
    row.totalAmount = totalAmount;
  }
  
  // Подсчёт итогов по этапам
  const stageTotals = new Map();
  for (const row of rows) {
    if (!stageTotals.has(row.stage)) {
      stageTotals.set(row.stage, { totalCount: 0, totalAmount: 0 });
    }
    const st = stageTotals.get(row.stage);
    st.totalCount += row.totalCount;
    st.totalAmount += row.totalAmount;
  }
  
  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  
  // Формируем HTML
  let html = '<table class="matrix-table"><thead><tr>';
  html += '<th>Этап / Сотрудник</th><th>Показатель</th>';
  for (const d of days) html += `<th>${formatHeader(d)}</th>`;
  html += '<th>Итого</th><tr></thead><tbody>';
  
  for (const row of rows) {
    const stageDisplay = stageNames[row.stage] || row.stage;
    // Строка "кол-во"
    html += `<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td>`;
    html += '<td class="row-sub-label">кол-во</td>';
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      html += `<td class="count-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="count">${val.count === 0 ? '' : val.count}</td>`;
    }
    html += `<td class="count-cell">${row.totalCount === 0 ? '' : row.totalCount}</td>`;
    html += `</tr>`;
    // Строка "метраж"
    html += `<tr><td class="row-sub-label">метраж</td>`;
    for (const d of days) {
      const val = row.daysMap[d] || { count: 0, amount: 0 };
      html += `<td class="amount-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="amount">${val.amount === 0 ? '' : val.amount}</td>`;
    }
    html += `<td class="amount-cell">${row.totalAmount === 0 ? '' : row.totalAmount}</td>`;
    html += `</tr>`;
  }
  
  // Итоговые строки по этапам
  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    // Строка "кол-во"
    html += `<tr><td colspan="2" class="row-label" style="background:#3a3a46;">${stageDisplay} (всего)</td>`;
    for (let i = 0; i < days.length; i++) html += '<td></td>';
    html += `<td class="count-cell">${totals.totalCount === 0 ? '' : totals.totalCount}</td>`;
    html += `</tr>`;
    // Строка "метраж"
    html += `<tr><td colspan="2" class="row-label" style="background:#3a3a46;"></td>`;
    for (let i = 0; i < days.length; i++) html += '<td></td>';
    html += `<td class="amount-cell">${totals.totalAmount === 0 ? '' : totals.totalAmount}</td>`;
    html += `</tr>`;
  }
  
  html += '</tbody></table>';
  matrixContainer.innerHTML = html;
  attachEditHandlers();
  setLoading(false);
}

// Редактирование и удаление
function attachEditHandlers() {
  const cells = document.querySelectorAll('.count-cell, .amount-cell');
  cells.forEach(cell => {
    if (!cell.dataset.stage) return;
    cell.style.cursor = 'pointer';
    // Удаляем старый обработчик, чтобы не накапливались
    if (cell._listener) cell.removeEventListener('click', cell._listener);
    const handler = async (e) => {
      e.stopPropagation();
      const stage = cell.dataset.stage;
      const employee = cell.dataset.employee;
      const dateStr = cell.dataset.date;
      const field = cell.dataset.field;
      const currentValue = cell.innerText === '' ? 0 : parseFloat(cell.innerText);
      const isAdmin = adminModeCheckbox.checked;
      const currentUser = employeeNameInput.value.trim();
      
      if (!isAdmin && currentUser !== employee) {
        alert('Редактировать можно только свои данные (или включите режим администратора)');
        return;
      }
      
      const action = prompt(`Что сделать?\n1 - Изменить ${field === 'count' ? 'количество' : 'метраж'}\n2 - Удалить запись за этот день`, '1');
      if (action === null) return;
      
      if (action === '2') {
        if (!confirm(`Удалить данные за ${dateStr} для ${employee} (${stage})?`)) return;
        setLoading(true, 'Удаление...');
        try {
          const snapshot = await db.collection('daily_totals')
            .where('date', '==', dateStr)
            .where('employee', '==', employee)
            .where('stage', '==', stage)
            .get();
          if (!snapshot.empty) {
            await db.collection('daily_totals').doc(snapshot.docs[0].id).delete();
            alert('Запись удалена');
            await loadReports();
          } else {
            alert('Запись не найдена');
          }
        } catch (err) {
          alert('Ошибка удаления: ' + err.message);
        } finally {
          setLoading(false);
        }
        return;
      }
      
      if (action === '1') {
        const newValue = prompt(`Введите новое значение для ${field === 'count' ? 'количества заказов' : 'метража'} (текущее: ${currentValue}):`, currentValue);
        if (newValue === null) return;
        const numValue = parseFloat(newValue);
        if (isNaN(numValue)) { alert('Введите число'); return; }
        setLoading(true, 'Обновление...');
        try {
          const snapshot = await db.collection('daily_totals')
            .where('date', '==', dateStr)
            .where('employee', '==', employee)
            .where('stage', '==', stage)
            .get();
          if (snapshot.empty) {
            await db.collection('daily_totals').add({
              date: dateStr, employee, stage,
              count: field === 'count' ? numValue : 0,
              amount: field === 'amount' ? numValue : 0,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            const docId = snapshot.docs[0].id;
            const update = {};
            if (field === 'count') update.count = numValue;
            else update.amount = numValue;
            await db.collection('daily_totals').doc(docId).update(update);
          }
          alert('Обновлено');
          await loadReports();
        } catch (err) {
          alert('Ошибка: ' + err.message);
        } finally {
          setLoading(false);
        }
      } else {
        alert('Неверный выбор');
      }
    };
    cell.addEventListener('click', handler);
    cell._listener = handler;
  });
}

// Экспорт в Excel (аналогичная логика, но с добавлением всех комбинаций)
async function exportToExcel() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) { alert('Выберите период'); return; }
  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeName.value.trim();

  setLoading(true, 'Экспорт...');
  const allData = await loadAllData();
  if (!allData.length) { setLoading(false); alert('Нет данных'); return; }

  const days = generateDateRange(fromDateStr, toDateStr);
  
  const allCombos = new Map();
  for (const item of allData) {
    const key = `${item.stage}|${item.employee}`;
    if (!allCombos.has(key)) allCombos.set(key, { stage: item.stage, employee: item.employee, daysMap: {} });
  }
  for (const item of allData) {
    if (!days.includes(item.date)) continue;
    const key = `${item.stage}|${item.employee}`;
    if (allCombos.has(key)) {
      allCombos.get(key).daysMap[item.date] = { count: item.count, amount: item.amount };
    }
  }
  
  let rows = Array.from(allCombos.values());
  if (stageFilter !== 'all') rows = rows.filter(r => r.stage === stageFilter);
  if (employeeFilter) rows = rows.filter(r => r.employee === employeeFilter);
  rows.sort((a, b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });
  for (const row of rows) {
    let tc = 0, ta = 0;
    for (const d of days) {
      const v = row.daysMap[d] || { count: 0, amount: 0 };
      tc += v.count; ta += v.amount;
    }
    row.totalCount = tc; row.totalAmount = ta;
  }
  
  const stageTotals = new Map();
  for (const row of rows) {
    if (!stageTotals.has(row.stage)) stageTotals.set(row.stage, { totalCount: 0, totalAmount: 0 });
    const st = stageTotals.get(row.stage);
    st.totalCount += row.totalCount; st.totalAmount += row.totalAmount;
  }
  
  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  let html = `<html><head><meta charset="UTF-8"><title>Итоги</title>
  <style>body{font-family:Calibri;margin:20px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #7f8c8d;padding:6px;text-align:center} th{background:#f2c94c} .row-label{background:#e9ecef;text-align:left} .row-sub-label{background:#e9ecef}</style></head><body>
  <h2>Итоги за ${fromDateStr} — ${toDateStr}</h2><table><thead><tr><th>Этап / Сотрудник</th><th>Показатель</th>`;
  for (const d of days) html += `<th>${formatHeader(d)}</th>`;
  html += `<th>Итого</th></tr></thead><tbody>`;
  
  for (const row of rows) {
    const stageDisplay = stageNames[row.stage] || row.stage;
    html += `<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td><td class="row-sub-label">кол-во</td>`;
    for (const d of days) {
      const v = row.daysMap[d] || { count: 0, amount: 0 };
      html += `<td>${v.count === 0 ? '' : v.count}</td>`;
    }
    html += `<td>${row.totalCount === 0 ? '' : row.totalCount}</td></tr>`;
    html += `<td><td class="row-sub-label">метраж</td>`;
    for (const d of days) {
      const v = row.daysMap[d] || { count: 0, amount: 0 };
      html += `<td>${v.amount === 0 ? '' : v.amount}</td>`;
    }
    html += `<td>${row.totalAmount === 0 ? '' : row.totalAmount}</td></tr>`;
  }
  
  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    html += `<tr><td colspan="2" class="row-label">${stageDisplay} (всего)</td>`;
    for (let i = 0; i < days.length; i++) html += `<td></td>`;
    html += `<td>${totals.totalCount === 0 ? '' : totals.totalCount}</td></tr>`;
    html += `<td><td colspan="2" class="row-label"></td>`;
    for (let i = 0; i < days.length; i++) html += `<td></td>`;
    html += `<td>${totals.totalAmount === 0 ? '' : totals.totalAmount}</td></tr>`;
  }
  
  html += `</tbody></table></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `totals_${fromDateStr}_${toDateStr}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
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
  return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
});
