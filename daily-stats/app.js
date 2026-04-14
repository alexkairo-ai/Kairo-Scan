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

// Административная аутентификация
let adminAuthenticated = false;
const ADMIN_PASSWORD = '1990';

const DEFAULT_EMPLOYEES = [
  "Олег", "Рауф", "Максим", "Виталий", "Андрей", "Борис", "Алексей",
  "Азамат", "Никита", "Владимир", "Сергей", "Дмитрий", "Расул",
  "Михаил", "Илья", "Руслан"
];
let currentEmployees = [];

const today = new Date();
reportDateInput.value = today.toISOString().slice(0, 10);
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate() - 7);
filterDateFrom.value = weekAgo.toISOString().slice(0, 10);
filterDateTo.value = today.toISOString().slice(0, 10);

const savedEmployee = localStorage.getItem('selectedEmployee');
if (savedEmployee) employeeSelect.value = savedEmployee;
employeeSelect.addEventListener('change', () => {
  localStorage.setItem('selectedEmployee', employeeSelect.value);
});

orderCountInput.value = '';
totalAmountInput.value = '';

function setLoading(show, text = 'Загрузка...') {
  loadingIndicator.style.display = show ? 'block' : 'none';
  if (show) loadingIndicator.textContent = '⏳ ' + text;
}

async function migrateLinks() {
  try {
    const snapshot = await db.collection('daily_totals').get();
    const pairs = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.employee && data.stage) pairs.add(`${data.employee}|${data.stage}`);
    });
    const batch = db.batch();
    for (const pair of pairs) {
      const [employee, stage] = pair.split('|');
      const linkRef = db.collection('employee_stage_links').doc(`${employee}|${stage}`);
      batch.set(linkRef, { employee, stage }, { merge: true });
    }
    await batch.commit();
  } catch (err) { console.error(err); }
}

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
  if (currentEmployees.includes(name.trim())) { alert('Такое имя уже есть'); return; }
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
  if (currentEmployees.includes(newName.trim())) { alert('Имя уже существует'); return; }
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

    const linkId = `${employee}|${stage}`;
    await db.collection('employee_stage_links').doc(linkId).set({ employee, stage }, { merge: true });

    orderCountInput.value = '';
    totalAmountInput.value = '';
  } catch (err) {
    alert('Ошибка: ' + err.message);
  } finally {
    setLoading(false);
  }
}

async function loadAllData() {
  try {
    const snapshot = await db.collection('daily_totals').get();
    const allData = [];
    snapshot.forEach(doc => allData.push({ id: doc.id, ...doc.data() }));
    return allData;
  } catch (err) { return []; }
}

async function loadAllLinks() {
  try {
    const snapshot = await db.collection('employee_stage_links').get();
    const links = [];
    snapshot.forEach(doc => links.push(doc.data()));
    return links;
  } catch (err) { return []; }
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
  if (!fromDateStr || !toDateStr) { alert('Выберите период'); return; }

  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeSelect.value;

  setLoading(true, 'Загрузка...');
  const allData = await loadAllData();
  let links = await loadAllLinks();
  if (links.length === 0) await migrateLinks();
  links = await loadAllLinks();

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
    if (!stageTotals.has(row.stage)) stageTotals.set(row.stage, { totalCount: 0, totalAmount: 0 });
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
    html += `<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}<\/td>`;
    html += '<td class="row-sub-label">кол-во<\/td>';
    for (const d of days) {
      const val = row.daysMap[d];
      html += `<td class="count-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="count">${val.count === 0 ? '' : val.count}<\/td>`;
    }
    html += `<td class="count-cell">${row.totalCount === 0 ? '' : row.totalCount}<\/td>`;
    html += `<\/tr>`;
    html += `<tr><td class="row-sub-label">метраж<\/td>`;
    for (const d of days) {
      const val = row.daysMap[d];
      html += `<td class="amount-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="amount">${val.amount === 0 ? '' : val.amount}<\/td>`;
    }
    html += `<td class="amount-cell">${row.totalAmount === 0 ? '' : row.totalAmount}<\/td>`;
    html += `<\/tr>`;
  }

  // ИТОГИ ПО ЭТАПАМ (ДВЕ СТРОКИ, КАК И ДЛЯ СОТРУДНИКОВ)
  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    const totalCount = totals.totalCount === 0 ? '' : totals.totalCount;
    const totalAmount = totals.totalAmount === 0 ? '' : totals.totalAmount;
    
    html += `<tr><td rowspan="2" class="row-label" style="background:#3a3a46;">${stageDisplay} (всего)<\/td>`;
    html += '<td class="row-sub-label">кол-во<\/td>';
    for (let i = 0; i < days.length; i++) html += '<td><\/td>';
    html += `<td class="count-cell">${totalCount}<\/td>`;
    html += `<\/tr>`;
    
    html += `<td><td class="row-sub-label">метраж<\/td>`;
    for (let i = 0; i < days.length; i++) html += '<td><\/td>';
    html += `<td class="amount-cell">${totalAmount}<\/td>`;
    html += `<\/tr>`;
  }

  html += '</tbody></table>';
  matrixContainer.innerHTML = html;
  setLoading(false);
}

// ==== КАСТОМНОЕ МОДАЛЬНОЕ ОКНО ДЛЯ РЕДАКТИРОВАНИЯ ====
function showEditModal(cellData) {
  return new Promise((resolve) => {
    const oldModal = document.getElementById('customEditModal');
    if (oldModal) oldModal.remove();

    const modalDiv = document.createElement('div');
    modalDiv.id = 'customEditModal';
    modalDiv.style.position = 'fixed';
    modalDiv.style.top = '0';
    modalDiv.style.left = '0';
    modalDiv.style.width = '100%';
    modalDiv.style.height = '100%';
    modalDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modalDiv.style.display = 'flex';
    modalDiv.style.alignItems = 'center';
    modalDiv.style.justifyContent = 'center';
    modalDiv.style.zIndex = '10000';
    
    const dialog = document.createElement('div');
    dialog.style.backgroundColor = '#1e1e2a';
    dialog.style.borderRadius = '16px';
    dialog.style.padding = '20px';
    dialog.style.width = '90%';
    dialog.style.maxWidth = '400px';
    dialog.style.border = '1px solid #caa24f';
    dialog.style.color = '#fff';
    
    const fieldName = cellData.field === 'count' ? 'количество заказов' : 'метраж';
    dialog.innerHTML = `
      <h3 style="margin-top:0;">Редактирование</h3>
      <p>Сотрудник: ${escapeHtml(cellData.employee)}</p>
      <p>Дата: ${cellData.date}</p>
      <p>Этап: ${cellData.stage}</p>
      <label>${fieldName}:</label>
      <input type="number" id="editValueInput" value="${cellData.currentValue}" style="width:100%; padding:8px; margin:10px 0; border-radius:8px; border:1px solid #caa24f; background:#0f1216; color:#fff;">
      <div style="display:flex; gap:10px; margin-top:15px;">
        <button id="editSaveBtn" class="primary" style="flex:1;">Сохранить</button>
        <button id="editDeleteBtn" class="secondary" style="flex:1; background:#8b0000;">Удалить</button>
        <button id="editCancelBtn" class="secondary" style="flex:1;">Отмена</button>
      </div>
    `;
    modalDiv.appendChild(dialog);
    document.body.appendChild(modalDiv);
    
    const input = document.getElementById('editValueInput');
    const saveBtn = document.getElementById('editSaveBtn');
    const deleteBtn = document.getElementById('editDeleteBtn');
    const cancelBtn = document.getElementById('editCancelBtn');
    
    const closeModal = (result) => {
      modalDiv.remove();
      resolve(result);
    };
    
    saveBtn.onclick = () => {
      const newValue = parseFloat(input.value);
      if (isNaN(newValue)) {
        alert('Введите число');
        return;
      }
      closeModal({ action: 'save', value: newValue });
    };
    deleteBtn.onclick = () => {
      if (confirm('Удалить эту запись?')) {
        closeModal({ action: 'delete' });
      }
    };
    cancelBtn.onclick = () => closeModal(null);
    input.focus();
  });
}

// Глобальный обработчик кликов с кастомным окном
matrixContainer.addEventListener('click', async (e) => {
  const cell = e.target.closest('.count-cell, .amount-cell');
  if (!cell) return;
  if (!cell.dataset.stage) return;
  
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
  
  const result = await showEditModal({
    stage, employee, date: dateStr, field, currentValue
  });
  if (!result) return;
  
  if (result.action === 'delete') {
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
  } else if (result.action === 'save') {
    const numValue = result.value;
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
  }
});

async function exportToExcel() {
  const fromDateStr = filterDateFrom.value;
  const toDateStr = filterDateTo.value;
  if (!fromDateStr || !toDateStr) { alert('Выберите период'); return; }
  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeSelect.value;

  setLoading(true, 'Экспорт...');
  const allData = await loadAllData();
  let links = await loadAllLinks();
  if (links.length === 0) await migrateLinks();
  links = await loadAllLinks();
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
    for (const d of days) { tc += row.daysMap[d].count; ta += row.daysMap[d].amount; }
    row.totalCount = tc; row.totalAmount = ta;
  }
  const stageTotals = new Map();
  for (const row of rows) {
    if (!stageTotals.has(row.stage)) stageTotals.set(row.stage, { totalCount: 0, totalAmount: 0 });
    const st = stageTotals.get(row.stage);
    st.totalCount += row.totalCount; st.totalAmount += row.totalAmount;
  }
  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  const monthYear = fromDateStr === toDateStr ? fromDateStr : `${fromDateStr} — ${toDateStr}`;

  let html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Итоги за ${monthYear}</title>
      <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #7f8c8d; padding: 6px; text-align: center; vertical-align: middle; }
        th { background-color: #f2c94c; font-weight: bold; }
        .row-label { background-color: #e9ecef; font-weight: bold; text-align: left; }
        .row-sub-label { background-color: #e9ecef; font-weight: normal; text-align: left; font-style: italic; }
        .count-cell, .amount-cell { text-align: center; }
      </style>
    </head>
    <body>
      <h2>Итоги за ${monthYear}</h2>
      <table>
        <thead>
          <tr>
            <th>Этап / Сотрудник</th>
            <th>Показатель</th>`;
  for (const d of days) {
    html += `<th>${formatHeader(d)}</th>`;
  }
  html += `<th>Итого</th>`;
  html += `</tr>`;
  html += `</thead><tbody>`;

  // СТРОКИ СОТРУДНИКОВ (БЕЗ ИЗМЕНЕНИЙ)
  for (const row of rows) {
    const stageDisplay = stageNames[row.stage] || row.stage;
    html += `<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}<\/td>`;
    html += `<td class="row-sub-label">кол-во<\/td>`;
    for (const d of days) {
      const val = row.daysMap[d];
      html += `<td class="count-cell">${val.count === 0 ? '' : val.count}<\/td>`;
    }
    html += `<td class="count-cell">${row.totalCount === 0 ? '' : row.totalCount}<\/td>`;
    html += `<\/tr>`;
    html += `<td><td class="row-sub-label">метраж<\/td>`;
    for (const d of days) {
      const val = row.daysMap[d];
      html += `<td class="amount-cell">${val.amount === 0 ? '' : val.amount}<\/td>`;
    }
    html += `<td class="amount-cell">${row.totalAmount === 0 ? '' : row.totalAmount}<\/td>`;
    html += `<\/tr>`;
  }

  // ИТОГИ ПО ЭТАПАМ (ДВЕ СТРОКИ, НЕ ЛОМАЕМ ВЕРХ)
  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    const totalCount = totals.totalCount === 0 ? '' : totals.totalCount;
    const totalAmount = totals.totalAmount === 0 ? '' : totals.totalAmount;
    
    html += `<td><td rowspan="2" class="row-label" style="background:#e9ecef;">${stageDisplay} (всего)<\/td>`;
    html += `<td class="row-sub-label">кол-во<\/td>`;
    for (let i = 0; i < days.length; i++) {
      html += `<td><\/td>`;
    }
    html += `<td class="count-cell">${totalCount}<\/td>`;
    html += `<\/tr>`;
    
    html += `<td><td class="row-sub-label">метраж<\/td>`;
    for (let i = 0; i < days.length; i++) {
      html += `<td><\/td>`;
    }
    html += `<td class="amount-cell">${totalAmount}<\/td>`;
    html += `<\/tr>`;
  }

  html += `</tbody></table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `totals_${monthYear.replace(/[^0-9а-яё]/gi, '_')}.xls`;
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

// ==== АДМИНИСТРАТИВНАЯ ЗАЩИТА ====
const adminPasswordModal = document.getElementById('adminPasswordModal');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const submitAdminPasswordBtn = document.getElementById('submitAdminPasswordBtn');
const cancelAdminPasswordBtn = document.getElementById('cancelAdminPasswordBtn');
const closeAdminModal = document.querySelector('.close-admin-modal');
const adminPasswordError = document.getElementById('adminPasswordError');

function closeAdminPasswordModal() {
  adminPasswordModal.style.display = 'none';
  adminPasswordInput.value = '';
  adminPasswordError.textContent = '';
}

function showAdminPasswordModal() {
  adminPasswordModal.style.display = 'block';
  adminPasswordInput.focus();
}

adminBtn.addEventListener('click', () => {
  if (adminAuthenticated) {
    renderAdminModal();
    adminModal.style.display = 'block';
  } else {
    adminBtn._pendingOpen = true;
    showAdminPasswordModal();
  }
});

adminModeCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    if (!adminAuthenticated) {
      showAdminPasswordModal();
      e.target.checked = false;
    }
  }
});

submitAdminPasswordBtn.addEventListener('click', () => {
  const enteredPassword = adminPasswordInput.value;
  if (enteredPassword === ADMIN_PASSWORD) {
    adminAuthenticated = true;
    closeAdminPasswordModal();
    if (!adminModeCheckbox.checked) {
      adminModeCheckbox.checked = true;
    }
    if (adminBtn._pendingOpen) {
      renderAdminModal();
      adminModal.style.display = 'block';
      adminBtn._pendingOpen = false;
    }
    alert('Режим администратора активирован');
  } else {
    adminPasswordError.textContent = 'Неверный пароль';
  }
});

cancelAdminPasswordBtn.addEventListener('click', closeAdminPasswordModal);
closeAdminModal.addEventListener('click', closeAdminPasswordModal);
window.addEventListener('click', (e) => {
  if (e.target === adminPasswordModal) closeAdminPasswordModal();
});

adminBtn._pendingOpen = false;

document.addEventListener('DOMContentLoaded', async () => {
  await loadEmployeesList();
  await migrateLinks();
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(reg => console.log('SW registered:', reg))
    .catch(err => console.error('SW registration failed:', err));
}
