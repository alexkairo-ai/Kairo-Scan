const API_URL = 'https://script.google.com/macros/s/AKfycbxKimZPQVxqJXlxaVirrr-vjNZS5VXYVI3096jP95FSIQyYELKrh3pAVwNaH9BmXnQ_pQ/exec'; // ваш URL

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

const reportMonth = document.getElementById('reportMonth');
const filterStage = document.getElementById('filterStage');
const filterEmployeeName = document.getElementById('filterEmployeeName');
const applyFiltersBtn = document.getElementById('applyFilters');
const exportExcelBtn = document.getElementById('exportExcel');
const matrixContainer = document.getElementById('matrixContainer');

// Установка даты по умолчанию
reportDateInput.value = new Date().toISOString().slice(0, 10);
reportMonth.value = new Date().toISOString().slice(0, 7);

// ========== Сохранение итогов ==========
function saveTotals() {
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
  const payload = {
    action: 'save_totals',
    data: JSON.stringify({
      stage,
      name: employee,
      date: formattedDate,
      count: count,
      amount: amount,
      orders: String(count),
      metrics: String(amount),
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
      alert('Ошибка: ' + (res.msg || 'неизвестная ошибка'));
    }
  }, (err) => {
    setLoading(false);
    alert('Ошибка связи: ' + err);
  });
}

// ========== Отчёты: матрица ==========
function loadReports() {
  const month = reportMonth.value;
  if (!month) return;
  const [year, monthNum] = month.split('-');
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDay = new Date(year, monthNum-1, 1);
  const lastDay = new Date(year, monthNum, 0);

  const fromDate = `${firstDay.getDate()}.${firstDay.getMonth()+1}.${String(firstDay.getFullYear()).slice(-2)}`;
  const toDate = `${lastDay.getDate()}.${lastDay.getMonth()+1}.${String(lastDay.getFullYear()).slice(-2)}`;

  const stage = filterStage.value;
  const employee = filterEmployeeName.value.trim();

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
    // Группируем по (этап, сотрудник) и дате
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
        entry.days[day] = { count: row.count, amount: row.amount };
      }
    }

    // Преобразуем в массив для отображения
    const rows = Array.from(map.values()).sort((a,b) => {
      if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
      return a.stage.localeCompare(b.stage);
    });

    // Строим HTML-таблицу
    let html = '<table class="matrix-table"><thead><tr><th>Этап / Сотрудник</th>';
    for (let d = 1; d <= daysInMonth; d++) {
      html += `<th>${d}</th>`;
    }
    html += '</tr></thead><tbody>';
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
  const employee = filterEmployeeName.value.trim();

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
        entry.days[day] = { count: row.count, amount: row.amount };
      }
    }

    const rows = Array.from(map.values()).sort((a,b) => {
      if (a.stage === b.stage) return a.employee.localeCompare(b.employee);
      return a.stage.localeCompare(b.stage);
    });

    // Формируем HTML для Excel
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

// JSONP helper
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  saveBtn.addEventListener('click', saveTotals);
  applyFiltersBtn.addEventListener('click', loadReports);
  exportExcelBtn.addEventListener('click', exportToExcel);
  tabInput.addEventListener('click', () => switchTab('input'));
  tabReports.addEventListener('click', () => switchTab('reports'));
});
