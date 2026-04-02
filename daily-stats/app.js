const db = window.db;

// DOM элементы
const loadingIndicator = document.getElementById('loadingIndicator');
const reportDateInput = document.getElementById('reportDate');
const employeeSelect = document.getElementById('employeeSelect');
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
const filterEmployeeSelect = document.getElementById('filterEmployeeSelect');
const adminModeCheckbox = document.getElementById('adminModeCheckbox');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');
const adminBtn = document.getElementById('adminBtn');
const adminModal = document.getElementById('adminModal');
const closeModal = document.querySelector('.close');
const addEmployeeBtn = document.getElementById('addEmployeeBtn');
const newEmployeeName = document.getElementById('newEmployeeName');
const resetEmployeesBtn = document.getElementById('resetEmployeesBtn');
const employeesListDiv = document.getElementById('employeesList');

// Список сотрудников по умолчанию
const DEFAULT_EMPLOYEES = [
  "Олег", "Рауф", "Максим", "Виталий", "Андрей", "Борис", "Алексей",
  "Азамат", "Никита", "Владимир", "Сергей", "Дмитрий", "Расул",
  "Михаил", "Илья", "Руслан"
];

let currentEmployees = [];

// Установка дат
const today = new Date();
reportDateInput.value = today.toISOString().slice(0, 10);
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate() - 7);
filterDateFrom.value = weekAgo.toISOString().slice(0, 10);
filterDateTo.value = today.toISOString().slice(0, 10);

// Запоминание выбранного сотрудника
const savedEmployee = localStorage.getItem('selectedEmployee');
if (savedEmployee) employeeSelect.value = savedEmployee;
employeeSelect.addEventListener('change', () => {
  localStorage.setItem('selectedEmployee', employeeSelect.value);
});

// Очищаем поля ввода от нулей (делаем пустыми)
orderCountInput.value = '';
totalAmountInput.value = '';

function setLoading(show, text = 'Загрузка...') {
  loadingIndicator.style.display = show ? 'block' : 'none';
  if (show) loadingIndicator.textContent = '⏳ ' + text;
}

// ========== МИГРАЦИЯ: создаём связи из существующих записей ==========
async function migrateLinks() {
  try {
    const snapshot = await db.collection('daily_totals').get();
    const pairs = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.employee && data.stage) {
        pairs.add(`${data.employee}|${data.stage}`);
      }
    });
    const batch = db.batch();
    for (const pair of pairs) {
      const [employee, stage] = pair.split('|');
      const linkId = `${employee}|${stage}`;
      const linkRef = db.collection('employee_stage_links').doc(linkId);
      batch.set(linkRef, { employee, stage }, { merge: true });
    }
    await batch.commit();
    console.log(`Миграция завершена: добавлено ${pairs.size} связей`);
  } catch (err) {
    console.error('Ошибка миграции:', err);
  }
}

// ========== УПРАВЛЕНИЕ СПИСКОМ СОТРУДНИКОВ ==========
async function loadEmployeesList() {
  try {
    const snapshot = await db.collection('employees_list').doc('master').get();
    if (snapshot.exists) {
      currentEmployees = snapshot.data().names || [];
    } else {
      currentEmployees = [...DEFAULT_EMPLOYEES];
      await db.collection('employees_list').doc('master').set({ names: currentEmployees });
    }
    populateEmployeeSelects();
  } catch (err) {
    console.error(err);
    currentEmployees = [...DEFAULT_EMPLOYEES];
    populateEmployeeSelects();
  }
}

async function saveEmployeesList() {
  await db.collection('employees_list').doc('master').set({ names: currentEmployees });
}

async function addEmployee(name) {
  if (!name.trim()) return;
  if (currentEmployees.includes(name.trim())) {
    alert('Такое имя уже есть');
    return;
  }
  currentEmployees.push(name.trim());
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Сотрудник добавлен');
}

async function deleteEmployee(name) {
  if (!confirm(`Удалить сотрудника "${name}"? Все его данные будут удалены из отчётов.`)) return;
  const snapshot = await db.collection('daily_totals').where('employee', '==', name).get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  currentEmployees = currentEmployees.filter(emp => emp !== name);
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Сотрудник удалён');
}

async function renameEmployee(oldName, newName) {
  if (!newName.trim()) return;
  if (currentEmployees.includes(newName.trim())) {
    alert('Имя уже существует');
    return;
  }
  const snapshot = await db.collection('daily_totals').where('employee', '==', oldName).get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.update(doc.ref, { employee: newName.trim() }));
  await batch.commit();
  const index = currentEmployees.indexOf(oldName);
  if (index !== -1) currentEmployees[index] = newName.trim();
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Имя обновлено');
}

async function resetToDefaultEmployees() {
  if (!confirm('Сбросить список сотрудников к исходному?')) return;
  currentEmployees = [...DEFAULT_EMPLOYEES];
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Список сброшен');
}

function populateEmployeeSelects() {
  employeeSelect.innerHTML = '<option value="">-- Выберите имя --</option>';
  filterEmployeeSelect.innerHTML = '<option value="">Все сотрудники</option>';
  currentEmployees.forEach(emp => {
    employeeSelect.innerHTML += `<option value="${escapeHtml(emp)}">${escapeHtml(emp)}</option>`;
    filterEmployeeSelect.innerHTML += `<option value="${escapeHtml(emp)}">${escapeHtml(emp)}</option>`;
  });
  const saved = localStorage.getItem('selectedEmployee');
  if (saved && currentEmployees.includes(saved)) employeeSelect.value = saved;
}

function renderAdminModal() {
  employeesListDiv.innerHTML = '';
  currentEmployees.forEach(emp => {
    const div = document.createElement('div');
    div.className = 'employee-setting';
    div.innerHTML = `
      <span class="name">${escapeHtml(emp)}</span>
      <input type="text" class="rename-input" placeholder="Новое имя" style="width: 150px;">
      <button class="rename-btn secondary">Переименовать</button>
      <button class="delete-btn secondary" style="background:#8b0000;">Удалить</button>
    `;
    const renameInput = div.querySelector('.rename-input');
    const renameBtn = div.querySelector('.rename-btn');
    const deleteBtn = div.querySelector('.delete-btn');
    renameBtn.addEventListener('click', () => {
      const newName = renameInput.value.trim();
      if (newName) renameEmployee(emp, newName);
      else alert('Введите новое имя');
    });
    deleteBtn.addEventListener('click', () => deleteEmployee(emp));
    employeesListDiv.appendChild(div);
  });
}

// ========== СОХРАНЕНИЕ ОТЧЁТА ==========
async function saveTotals() {
  const date = reportDateInput.value;
  const employee = employeeSelect.value;
  const stage = stageSelect.value;
  let count = parseInt(orderCountInput.value);
  if (isNaN(count)) count = 0;
  let amount = parseFloat(totalAmountInput.value);
  if (isNaN(amount)) amount = 0;

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

    // Сохраняем связку
    const linkId = `${employee}|${stage}`;
    const linkRef = db.collection('employee_stage_links').doc(linkId);
    await linkRef.set({ employee, stage }, { merge: true });

    // Очищаем поля
    orderCountInput.value = '';
    totalAmountInput.value = '';
  } catch (err) {
    alert('Ошибка: ' + err.message);
  } finally {
    setLoading(false);
  }
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
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

async function loadAllLinks() {
  try {
    const snapshot = await db.collection('employee_stage_links').get();
    const links = [];
    snapshot.forEach(doc => links.push(doc.data()));
    return links;
  } catch (err) {
    console.error(err);
    return [];
  }
}

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

async function loadReports() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) {
    alert('Выберите период');
    return;
  }

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeSelect.value;

  setLoading(true, 'Загрузка...');
  const allData = await loadAllData();
  let links = await loadAllLinks();

  // Если связей нет, пробуем миграцию (один раз)
  if (links.length === 0) {
    await migrateLinks();
    links = await loadAllLinks();
  }

  const days = generateDateRange(fromDateStr, toDateStr);

  // Фильтруем связи
  if (stageFilter !== 'all') {
    links = links.filter(link => link.stage === stageFilter);
  }
  if (employeeFilter) {
    links = links.filter(link => link.employee === employeeFilter);
  }

  links.sort((a, b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const rows = links.map(link => {
    const daysMap = {};
    for (const d of days) {
      daysMap[d] = { count: 0, amount: 0 };
    }
    return { stage: link.stage, employee: link.employee, daysMap };
  });

  for (const item of allData) {
    if (!days.includes(item.date)) continue;
    const row = rows.find(r => r.stage === item.stage && r.employee === item.employee);
    if (row) {
      row.daysMap[item.date] = { count: item.count, amount: item.amount };
    }
  }

  for (const row of rows) {
    let totalCount = 0, totalAmount = 0;
    for (const d of days) {
      totalCount += row.daysMap[d].count;
      totalAmount += row.daysMap[d].amount;
    }
    row.totalCount = totalCount;
    row.totalAmount = totalAmount;
  }

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

  let html = '<table class="matrix-table"><thead><tr>';
  html += '<th>Этап / Сотрудник</th><th>Показатель</th>';
  for (const d of days) html += `<th>${formatHeader(d)}</th>`;
  html += '<th>Итого</th></tr></thead><tbody>';

  for (const row of rows) {
    const stageDisplay = stageNames[row.stage] || row.stage;
    html += `<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td>`;
    html += '<td class="row-sub-label">кол-во</td>';
    for (const d of days) {
      const val = row.daysMap[d];
      html += `<td class="count-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="count">${val.count === 0 ? '' : val.count}</td>`;
    }
    html += `<td class="count-cell">${row.totalCount === 0 ? '' : row.totalCount}</td></tr>`;
    html += `<tr><td class="row-sub-label">метраж</td>`;
    for (const d of days) {
      const val = row.daysMap[d];
      html += `<td class="amount-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="amount">${val.amount === 0 ? '' : val.amount}</td>`;
    }
    html += `<td class="amount-cell">${row.totalAmount === 0 ? '' : row.totalAmount}</td></tr>`;
  }

  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    html += `<tr><td colspan="2" class="row-label" style="background:#3a3a46;">${stageDisplay} (всего)</td>`;
    for (let i = 0; i < days.length; i++) html += '<td></td>`;
    html += `<td class="count-cell">${totals.totalCount === 0 ? '' : totals.totalCount}</td></tr>`;
    html += `<tr><td colspan="2" class="row-label" style="background:#3a3a46;"></td>`;
    for (let i = 0; i < days.length; i++) html += '<td></td>`;
    html += `<td class="amount-cell">${totals.totalAmount === 0 ? '' : totals.totalAmount}</td></tr>`;
  }

  html += '</tbody></tr>';
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
    if (cell._listener) cell.removeEventListener('click', cell._listener);
    const handler = async (e) => {
      e.stopPropagation();
      const stage = cell.dataset.stage;
      const employee = cell.dataset.employee;
      const dateStr = cell.dataset.date;
      const field = cell.dataset.field;
      const currentValue = cell.innerText === '' ? 0 : parseFloat(cell.innerText);
      const isAdmin = adminModeCheckbox.checked;
      const currentUser = employeeSelect.value;
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

// ========== ЭКСПОРТ В EXCEL ==========
async function exportToExcel() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) { alert('Выберите период'); return; }
  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeSelect.value;

  setLoading(true, 'Экспорт...');
  const allData = await loadAllData();
  let links = await loadAllLinks();
  if (links.length === 0) {
    await migrateLinks();
    links = await loadAllLinks();
  }
  const days = generateDateRange(fromDateStr, toDateStr);

  if (stageFilter !== 'all') links = links.filter(l => l.stage === stageFilter);
  if (employeeFilter) links = links.filter(l => l.employee === employeeFilter);
  links.sort((a,b) => {
    if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });

  const rows = links.map(link => {
    const daysMap = {};
    for (const d of days) daysMap[d] = { count: 0, amount: 0 };
    return { stage: link.stage, employee: link.employee, daysMap };
  });
  for (const item of allData) {
    if (!days.includes(item.date)) continue;
    const row = rows.find(r => r.stage === item.stage && r.employee === item.employee);
    if (row) row.daysMap[item.date] = { count: item.count, amount: item.amount };
  }
  for (const row of rows) {
    let tc = 0, ta = 0;
    for (const d of days) {
      tc += row.daysMap[d].count;
      ta += row.daysMap[d].amount;
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

  let lines = [];
  lines.push('<html><head><meta charset="UTF-8"><title>Итоги</title>');
  lines.push('<style>body{font-family:Calibri;margin:20px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #7f8c8d;padding:6px;text-align:center} th{background:#f2c94c} .row-label{background:#e9ecef;text-align:left} .row-sub-label{background:#e9ecef}</style>');
  lines.push('</head><body>');
  lines.push(`<h2>Итоги за ${fromDateStr} — ${toDateStr}</h2>`);
  lines.push('<table><thead><tr><th>Этап / Сотрудник</th><th>Показатель</th>');
  for (const d of days) lines.push(`<th>${formatHeader(d)}</th>`);
  lines.push('<th>Итого</th></tr></thead><tbody>');

  for (const row of rows) {
    const stageDisplay = stageNames[row.stage] || row.stage;
    lines.push(`<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td><td class="row-sub-label">кол-во</td>`);
    for (const d of days) {
      const val = row.daysMap[d];
      lines.push(`<td>${val.count === 0 ? '' : val.count}</td>`);
    }
    lines.push(`<td>${row.totalCount === 0 ? '' : row.totalCount}</td></tr>`);
    lines.push(`<tr><td class="row-sub-label">метраж</td>`);
    for (const d of days) {
      const val = row.daysMap[d];
      lines.push(`<td>${val.amount === 0 ? '' : val.amount}</td>`);
    }
    lines.push(`<td>${row.totalAmount === 0 ? '' : row.totalAmount}</td></tr>`);
  }

  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    lines.push(`<tr><td colspan="2" class="row-label">${stageDisplay} (всего)</td>`);
    for (let i = 0; i < days.length; i++) lines.push('<td></td>');
    lines.push(`<td>${totals.totalCount === 0 ? '' : totals.totalCount}</td></tr>`);
    lines.push(`<tr><td colspan="2" class="row-label"></td>`);
    for (let i = 0; i < days.length; i++) lines.push('<td></td>');
    lines.push(`<td>${totals.totalAmount === 0 ? '' : totals.totalAmount}</td></tr>`);
  }

  lines.push('</tbody></table></body></html>');
  const html = lines.join('');
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

// Модальное окно
adminBtn.addEventListener('click', () => {
  renderAdminModal();
  adminModal.style.display = 'block';
});
closeModal.addEventListener('click', () => adminModal.style.display = 'none');
window.addEventListener('click', (e) => { if (e.target === adminModal) adminModal.style.display = 'none'; });
addEmployeeBtn.addEventListener('click', () => {
  const name = newEmployeeName.value.trim();
  if (name) addEmployee(name);
  newEmployeeName.value = '';
});
resetEmployeesBtn.addEventListener('click', resetToDefaultEmployees);

document.addEventListener('DOMContentLoaded', async () => {
  await loadEmployeesList();
  await migrateLinks(); // однократная миграция (не страшно запускать каждый раз, но если связей нет – создаст)
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
});
