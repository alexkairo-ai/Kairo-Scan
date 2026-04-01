const API_URL = 'https://script.google.com/macros/s/AKfycbxkd82t9NGFfboV2FDy7klyIyLoBK-3Vlzo7z9vNEUVabG5EsEP3SqJuiOyRfs5zeFeMw/exec'; // замените на свой URL

let employeesData = [];
let employeeStageOptions = [];
let employeeAliases = {};
let hiddenNames = [];

// Элементы
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

const reportMonth = document.getElementById('reportMonth');
const filterStage = document.getElementById('filterStage');
const filterEmployee = document.getElementById('filterEmployee');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');

// Настройки
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.querySelector('.close');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const employeesSettingsList = document.getElementById('employeesSettingsList');

// Установка дат по умолчанию
reportDateInput.value = new Date().toISOString().slice(0, 10);
reportMonth.value = new Date().toISOString().slice(0, 7);

// ========== Работа с настройками ==========
function loadSettings() {
  try {
    const saved = localStorage.getItem('employeeSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      employeeAliases = settings.aliases || {};
      hiddenNames = settings.hidden || [];
    } else {
      employeeAliases = {};
      hiddenNames = [];
    }
  } catch(e) {
    employeeAliases = {};
    hiddenNames = [];
  }
}

function saveSettings() {
  localStorage.setItem('employeeSettings', JSON.stringify({
    aliases: employeeAliases,
    hidden: hiddenNames
  }));
}

function resetSettings() {
  employeeAliases = {};
  hiddenNames = [];
  saveSettings();
  rebuildEmployeeOptions();
  populateSelects();
  closeSettingsModal();
  alert('Настройки сброшены');
}

function rebuildEmployeeOptions() {
  const visibleEmployees = employeesData.filter(emp => !hiddenNames.includes(emp.name));
  const aliasMap = new Map();
  for (const emp of visibleEmployees) {
    let displayName = emp.name;
    for (const [alias, names] of Object.entries(employeeAliases)) {
      if (names.includes(emp.name)) {
        displayName = alias;
        break;
      }
    }
    if (!aliasMap.has(displayName)) {
      aliasMap.set(displayName, { originalNames: new Set(), stages: new Set() });
    }
    const entry = aliasMap.get(displayName);
    entry.originalNames.add(emp.name);
    for (const stage of emp.stages) entry.stages.add(stage);
  }
  employeeStageOptions = [];
  const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
  for (const [displayName, data] of aliasMap.entries()) {
    for (const stage of data.stages) {
      employeeStageOptions.push({
        id: `${displayName}|${stage}`,
        displayName: `${displayName} (${stageNames[stage] || stage})`,
        originalNames: Array.from(data.originalNames),
        stage: stage
      });
    }
  }
  employeeStageOptions.sort((a,b) => a.displayName.localeCompare(b.displayName));
}

function populateSelects() {
  employeeSelect.innerHTML = '<option value="">-- Выберите имя --</option>';
  const uniqueNames = [...new Set(employeeStageOptions.map(opt => opt.displayName.split(' (')[0]))];
  for (const name of uniqueNames) {
    employeeSelect.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
  }
  filterEmployee.innerHTML = '<option value="">Все сотрудники</option>';
  for (const name of uniqueNames) {
    filterEmployee.innerHTML += `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
  }
}

function getEmployeeOriginalNames(displayName) {
  const opt = employeeStageOptions.find(o => o.displayName.startsWith(displayName + ' ('));
  return opt ? opt.originalNames : [displayName];
}

// ========== Загрузка сотрудников ==========
function loadEmployees() {
  const cached = localStorage.getItem('employeesData');
  const cacheTime = localStorage.getItem('employeesDataTime');
  if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < 3600000)) {
    try {
      employeesData = JSON.parse(cached);
      loadSettings();
      rebuildEmployeeOptions();
      populateSelects();
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
      loadSettings();
      rebuildEmployeeOptions();
      populateSelects();
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

// ========== Сохранение итогов ==========
function saveTotals() {
  const date = reportDateInput.value;
  const employeeDisplay = employeeSelect.value;
  const stage = stageSelect.value;
  const count = parseInt(orderCountInput.value) || 0;
  const amount = parseFloat(totalAmountInput.value) || 0;

  if (!date) { alert('Выберите дату'); return; }
  if (!employeeDisplay) { alert('Выберите сотрудника'); return; }
  if (!stage) { alert('Выберите этап'); return; }

  const [year, month, day] = date.split('-');
  const formattedDate = `${day}.${month}.${year.slice(-2)}`;

  setLoading(true, 'Сохранение...');
  const payload = {
    action: 'save_totals',
    data: JSON.stringify({
      stage,
      name: employeeDisplay,
      date: formattedDate,
      orders: [String(count)],    // массив из одного элемента (количество)
      metrics: [amount],          // массив из одного элемента (метраж)
      total: amount
    })
  };
  callApiJsonp(payload, (res) => {
    setLoading(false);
    if (res.ok) {
      alert('Итоги сохранены!');
      orderCountInput.value = '0';
      totalAmountInput.value = '0';
    } else {
      alert('Ошибка: ' + res.msg);
    }
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи: ' + err);
  });
}

// ========== Отчёты: матрица ==========
async function loadReports() {
  const month = reportMonth.value;
  if (!month) return;
  const [year, monthNum] = month.split('-');
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDay = new Date(year, monthNum-1, 1);
  const lastDay = new Date(year, monthNum, 0);

  const fromDate = `${firstDay.getDate()}.${firstDay.getMonth()+1}.${String(firstDay.getFullYear()).slice(-2)}`;
  const toDate = `${lastDay.getDate()}.${lastDay.getMonth()+1}.${String(lastDay.getFullYear()).slice(-2)}`;

  const stage = filterStage.value;
  const employee = filterEmployee.value;

  setLoading(true, 'Загрузка данных...');
  callApiJsonp({
    action: 'get_totals',
    fromDate,
    toDate,
    stage: stage === 'all' ? 'all' : stage,
    employee: employee || ''
  }, (res) => {
    setLoading(false);
    if (!res.ok) {
      matrixContainer.innerHTML = '<p>Ошибка загрузки данных</p>';
      return;
    }

    const data = res.data || [];
    const stageNames = { pila:'Пила', kromka:'Кромка', prisadka:'Присадка', upakovka:'Упаковка', hdf:'Пила ХДФ' };
    const map = new Map(); // ключ "этап|сотрудник" -> массив по дням

    for (const row of data) {
      const key = `${row.stage}|${row.employee}`;
      if (!map.has(key)) {
        map.set(key, { stage: row.stage, employee: row.employee, days: new Array(daysInMonth).fill({ count: 0, amount: 0 }) });
      }
      const entry = map.get(key);
      const day = parseInt(row.date.split('.')[0]) - 1;
      if (day >= 0 && day < daysInMonth) {
        // Парсим количество и метраж из строк orders и metrics
        let count = 0;
        let amount = 0;
        if (row.orders) {
          if (row.orders.includes(',')) {
            count = row.orders.split(',').filter(s => s.trim()).length;
          } else {
            count = parseInt(row.orders) || 0;
          }
        }
        if (row.metrics) {
          if (row.metrics.includes(',')) {
            amount = row.metrics.split(',').reduce((sum, s) => sum + (parseFloat(s) || 0), 0);
          } else {
            amount = parseFloat(row.metrics) || 0;
          }
        }
        entry.days[day] = { count, amount };
      }
    }

    const rows = Array.from(map.values()).sort((a,b) => {
      if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
      return a.stage.localeCompare(b.stage);
    });

    let html = '<table class="matrix-table"><thead><td><th>Этап / Сотрудник</th>';
    for (let d = 1; d <= daysInMonth; d++) {
      html += `<th>${d}</th>`;
    }
    html += '</thead><tbody>';
    for (const row of rows) {
      const stageName = stageNames[row.stage] || row.stage;
      html += `<tr><td class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
      for (let d = 0; d < daysInMonth; d++) {
        const dayData = row.days[d];
        html += `<td class="matrix-cell">${dayData.count}/${dayData.amount}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    matrixContainer.innerHTML = html;
  }, (err) => {
    setLoading(false);
    matrixContainer.innerHTML = '<p>Ошибка связи</p>';
  });
}

// ========== Экспорт в Excel ==========
function exportToExcel() {
  const month = reportMonth.value;
  if (!month) return;
  const [year, monthNum] = month.split('-');
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDay = new Date(year, monthNum-1, 1);
  const lastDay = new Date(year, monthNum, 0);

  const fromDate = `${firstDay.getDate()}.${firstDay.getMonth()+1}.${String(firstDay.getFullYear()).slice(-2)}`;
  const toDate = `${lastDay.getDate()}.${lastDay.getMonth()+1}.${String(lastDay.getFullYear()).slice(-2)}`;

  const stage = filterStage.value;
  const employee = filterEmployee.value;

  setLoading(true, 'Подготовка экспорта...');
  callApiJsonp({
    action: 'get_totals',
    fromDate,
    toDate,
    stage: stage === 'all' ? 'all' : stage,
    employee: employee || ''
  }, (res) => {
    setLoading(false);
    if (!res.ok) {
      alert('Ошибка загрузки данных');
      return;
    }

    const data = res.data || [];
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
        let count = 0;
        let amount = 0;
        if (row.orders) {
          if (row.orders.includes(',')) {
            count = row.orders.split(',').filter(s => s.trim()).length;
          } else {
            count = parseInt(row.orders) || 0;
          }
        }
        if (row.metrics) {
          if (row.metrics.includes(',')) {
            amount = row.metrics.split(',').reduce((sum, s) => sum + (parseFloat(s) || 0), 0);
          } else {
            amount = parseFloat(row.metrics) || 0;
          }
        }
        entry.days[day] = { count, amount };
      }
    }

    const rows = Array.from(map.values()).sort((a,b) => {
      if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
      return a.stage.localeCompare(b.stage);
    });

    let html = `<html><head><meta charset="UTF-8"><title>Итоги за ${month}</title>
    <style>
      body { font-family: Calibri, Arial; margin: 20px; }
      table { border-collapse: collapse; width: 100%; margin-top: 20px; }
      th, td { border: 1px solid #7f8c8d; padding: 6px; text-align: center; vertical-align: middle; }
      th { background-color: #f2c94c; font-weight: bold; }
      .row-label { background-color: #e9ecef; font-weight: bold; text-align: left; }
      .matrix-cell { text-align: center; }
    </style></head><body>
    <h2>Итоги за ${month}</h2>
    <table><thead><tr><th>Этап / Сотрудник</th>`;
    for (let d = 1; d <= daysInMonth; d++) html += `<th>${d}</th>`;
    html += `</tr></thead><tbody>`;
    for (const row of rows) {
      const stageName = stageNames[row.stage] || row.stage;
      html += `<tr><td class="row-label">${stageName}<br>${escapeHtml(row.employee)}</td>`;
      for (let d = 0; d < daysInMonth; d++) {
        const dayData = row.days[d];
        html += `<td class="matrix-cell">${dayData.count}/${dayData.amount}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `totals_${month}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи');
  });
}

// ========== Вспомогательные ==========
function setLoading(show, text = 'Загрузка...') {
  if (show) {
    loadingIndicator.textContent = '⏳ ' + text;
    loadingIndicator.style.display = 'block';
  } else {
    loadingIndicator.style.display = 'none';
  }
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

// ========== Настройки ==========
function openSettingsModal() {
  const allNames = [...new Set(employeesData.map(e => e.name))];
  employeesSettingsList.innerHTML = '';
  for (const name of allNames) {
    const isHidden = hiddenNames.includes(name);
    let currentAlias = null;
    for (const [alias, names] of Object.entries(employeeAliases)) {
      if (names.includes(name)) {
        currentAlias = alias;
        break;
      }
    }
    const div = document.createElement('div');
    div.className = 'employee-setting';
    div.innerHTML = `
      <span class="name">${escapeHtml(name)}</span>
      <label class="hide-check">
        <input type="checkbox" data-name="${escapeHtml(name)}" class="hide-checkbox" ${isHidden ? 'checked' : ''}>
        Скрыть
      </label>
      <select class="alias-select" data-name="${escapeHtml(name)}">
        <option value="">-- Без объединения --</option>
        ${allNames.map(n => `<option value="${escapeHtml(n)}" ${currentAlias === n ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('')}
      </select>
      <span style="font-size:12px;">(объединить с именем)</span>
    `;
    employeesSettingsList.appendChild(div);
  }
  settingsModal.style.display = 'block';
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

function applySettingsFromModal() {
  const newHidden = [];
  const newAliases = {};
  const allNames = [...new Set(employeesData.map(e => e.name))];
  for (const name of allNames) {
    const hideCheck = document.querySelector(`.hide-checkbox[data-name="${escapeHtml(name)}"]`);
    if (hideCheck && hideCheck.checked) newHidden.push(name);
    const aliasSelect = document.querySelector(`.alias-select[data-name="${escapeHtml(name)}"]`);
    if (aliasSelect && aliasSelect.value && aliasSelect.value !== name) {
      const targetAlias = aliasSelect.value;
      if (!newAliases[targetAlias]) newAliases[targetAlias] = [];
      newAliases[targetAlias].push(name);
    }
  }
  hiddenNames = newHidden;
  employeeAliases = newAliases;
  saveSettings();
  rebuildEmployeeOptions();
  populateSelects();
  closeSettingsModal();
  if (reportsPanel.style.display !== 'none') loadReports();
  alert('Настройки применены');
}

// ========== JSONP ==========
function callApiJsonp(params, cb, onError) {
  const cbName = 'cb_' + Math.random().toString(36).substring(2);
  let done = false;
  const timeout = setTimeout(() => {
    if (!done) {
      done = true;
      if (onError) onError('Нет ответа от сервера');
      delete window[cbName];
    }
  }, 15000);
  window[cbName] = function(data) {
    if (done) return;
    done = true;
    clearTimeout(timeout);
    cb(data);
    setTimeout(() => delete window[cbName], 1000);
  };
  const query = new URLSearchParams(params);
  query.set('api', '1');
  query.set('callback', cbName);
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

// ========== Инициализация ==========
document.addEventListener('DOMContentLoaded', () => {
  loadEmployees();

  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));

  settingsBtn.addEventListener('click', openSettingsModal);
  closeModal.addEventListener('click', closeSettingsModal);
  window.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettingsModal(); });
  saveSettingsBtn.addEventListener('click', applySettingsFromModal);
  resetSettingsBtn.addEventListener('click', resetSettings);
});
