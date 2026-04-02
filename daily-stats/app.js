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

const DEFAULT_EMPLOYEES = ["Олег","Рауф","Максим","Виталий","Андрей","Борис","Алексей","Азамат","Никита","Владимир","Сергей","Дмитрий","Расул","Михаил","Илья","Руслан"];
let currentEmployees = [];

const today = new Date();
reportDateInput.value = today.toISOString().slice(0,10);
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate()-7);
filterDateFrom.value = weekAgo.toISOString().slice(0,10);
filterDateTo.value = today.toISOString().slice(0,10);

const savedEmployee = localStorage.getItem('selectedEmployee');
if(savedEmployee) employeeSelect.value = savedEmployee;
employeeSelect.addEventListener('change',()=>{
  localStorage.setItem('selectedEmployee',employeeSelect.value);
});

orderCountInput.value = '';
totalAmountInput.value = '';

function setLoading(show,text='Загрузка...'){
  loadingIndicator.style.display = show ? 'block' : 'none';
  if(show) loadingIndicator.textContent = '⏳ '+text;
}

async function migrateLinks(){
  try{
    const snap = await db.collection('daily_totals').get();
    const pairs = new Set();
    snap.forEach(doc=>{
      const d=doc.data();
      if(d.employee && d.stage) pairs.add(d.employee+'|'+d.stage);
    });
    const batch = db.batch();
    for(const p of pairs){
      const [emp,stg] = p.split('|');
      const ref = db.collection('employee_stage_links').doc(emp+'|'+stg);
      batch.set(ref,{employee:emp,stage:stg},{merge:true});
    }
    await batch.commit();
  }catch(e){console.error(e);}
}

async function loadEmployeesList(){
  try{
    const doc = await db.collection('employees_list').doc('master').get();
    if(doc.exists){
      currentEmployees = doc.data().names || [];
    }else{
      currentEmployees = [...DEFAULT_EMPLOYEES];
      await db.collection('employees_list').doc('master').set({names:currentEmployees});
    }
    populateEmployeeSelects();
  }catch(e){
    currentEmployees = [...DEFAULT_EMPLOYEES];
    populateEmployeeSelects();
  }
}

async function saveEmployeesList(){
  await db.collection('employees_list').doc('master').set({names:currentEmployees});
}

async function addEmployee(name){
  name = name.trim();
  if(!name) return;
  if(currentEmployees.includes(name)){ alert('Такое имя уже есть'); return; }
  currentEmployees.push(name);
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Сотрудник добавлен');
}

async function deleteEmployee(name){
  if(!confirm(`Удалить сотрудника "${name}"? Все его данные будут удалены.`)) return;
  const snap = await db.collection('daily_totals').where('employee','==',name).get();
  const batch = db.batch();
  snap.forEach(d=>batch.delete(d.ref));
  await batch.commit();
  currentEmployees = currentEmployees.filter(e=>e!==name);
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Сотрудник удалён');
}

async function renameEmployee(oldName,newName){
  newName = newName.trim();
  if(!newName) return;
  if(currentEmployees.includes(newName)){ alert('Имя уже существует'); return; }
  const snap = await db.collection('daily_totals').where('employee','==',oldName).get();
  const batch = db.batch();
  snap.forEach(d=>batch.update(d.ref,{employee:newName}));
  await batch.commit();
  const idx = currentEmployees.indexOf(oldName);
  if(idx!==-1) currentEmployees[idx]=newName;
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Имя обновлено');
}

async function resetToDefaultEmployees(){
  if(!confirm('Сбросить список сотрудников к исходному?')) return;
  currentEmployees = [...DEFAULT_EMPLOYEES];
  await saveEmployeesList();
  populateEmployeeSelects();
  renderAdminModal();
  alert('Список сброшен');
}

function populateEmployeeSelects(){
  employeeSelect.innerHTML = '<option value="">-- Выберите имя --</option>';
  filterEmployeeSelect.innerHTML = '<option value="">Все сотрудники</option>';
  currentEmployees.forEach(emp=>{
    employeeSelect.innerHTML += `<option value="${escapeHtml(emp)}">${escapeHtml(emp)}</option>`;
    filterEmployeeSelect.innerHTML += `<option value="${escapeHtml(emp)}">${escapeHtml(emp)}</option>`;
  });
  const saved = localStorage.getItem('selectedEmployee');
  if(saved && currentEmployees.includes(saved)) employeeSelect.value = saved;
}

function renderAdminModal(){
  employeesListDiv.innerHTML = '';
  currentEmployees.forEach(emp=>{
    const div = document.createElement('div');
    div.className = 'employee-setting';
    div.innerHTML = `
      <span class="name">${escapeHtml(emp)}</span>
      <input type="text" class="rename-input" placeholder="Новое имя" style="width:150px">
      <button class="rename-btn secondary">Переименовать</button>
      <button class="delete-btn secondary" style="background:#8b0000;">Удалить</button>
    `;
    const renameInput = div.querySelector('.rename-input');
    const renameBtn = div.querySelector('.rename-btn');
    const deleteBtn = div.querySelector('.delete-btn');
    renameBtn.onclick = ()=>{
      const newName = renameInput.value.trim();
      if(newName) renameEmployee(emp,newName);
      else alert('Введите новое имя');
    };
    deleteBtn.onclick = ()=>deleteEmployee(emp);
    employeesListDiv.appendChild(div);
  });
}

async function saveTotals(){
  const date = reportDateInput.value;
  const employee = employeeSelect.value;
  const stage = stageSelect.value;
  let count = parseInt(orderCountInput.value);
  if(isNaN(count)) count=0;
  let amount = parseFloat(totalAmountInput.value);
  if(isNaN(amount)) amount=0;
  if(!date || !employee || !stage){
    alert('Заполните дату, имя и этап');
    return;
  }
  const [year,month,day] = date.split('-');
  const formattedDate = `${day}.${month}.${year.slice(-2)}`;
  setLoading(true,'Сохранение...');
  try{
    const snap = await db.collection('daily_totals')
      .where('date','==',formattedDate)
      .where('employee','==',employee)
      .where('stage','==',stage)
      .get();
    if(!snap.empty){
      const id = snap.docs[0].id;
      await db.collection('daily_totals').doc(id).update({count,amount,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
      alert('Данные обновлены');
    }else{
      await db.collection('daily_totals').add({date:formattedDate,employee,stage,count,amount,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
      alert('Данные сохранены');
    }
    const linkId = employee+'|'+stage;
    await db.collection('employee_stage_links').doc(linkId).set({employee,stage},{merge:true});
    orderCountInput.value = '';
    totalAmountInput.value = '';
  }catch(err){
    alert('Ошибка: '+err.message);
  }finally{
    setLoading(false);
  }
}

async function loadAllData(){
  try{
    const snap = await db.collection('daily_totals').get();
    const res=[];
    snap.forEach(d=>res.push({id:d.id,...d.data()}));
    return res;
  }catch(e){return [];}
}

async function loadAllLinks(){
  try{
    const snap = await db.collection('employee_stage_links').get();
    const res=[];
    snap.forEach(d=>res.push(d.data()));
    return res;
  }catch(e){return [];}
}

function generateDateRange(from,to){
  const f = new Date(from);
  const t = new Date(to);
  const days=[];
  let cur = new Date(f);
  while(cur<=t){
    const d = cur.getDate().toString().padStart(2,'0');
    const m = (cur.getMonth()+1).toString().padStart(2,'0');
    const y = cur.getFullYear().toString().slice(-2);
    days.push(`${d}.${m}.${y}`);
    cur.setDate(cur.getDate()+1);
  }
  return days;
}

function formatHeader(ds){
  return ds.split('.')[0]+'.'+ds.split('.')[1];
}

async function loadReports(){
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  if(!from || !to){ alert('Выберите период'); return; }
  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeSelect.value;
  setLoading(true,'Загрузка...');
  const allData = await loadAllData();
  let links = await loadAllLinks();
  if(links.length===0) await migrateLinks();
  links = await loadAllLinks();
  const days = generateDateRange(from,to);
  if(stageFilter!=='all') links = links.filter(l=>l.stage===stageFilter);
  if(employeeFilter) links = links.filter(l=>l.employee===employeeFilter);
  links.sort((a,b)=>{
    if(a.stage===b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });
  const rows = links.map(link=>{
    const dm={};
    for(const d of days) dm[d]={count:0,amount:0};
    return {stage:link.stage,employee:link.employee,daysMap:dm};
  });
  for(const item of allData){
    if(!days.includes(item.date)) continue;
    const row = rows.find(r=>r.stage===item.stage && r.employee===item.employee);
    if(row) row.daysMap[item.date]={count:item.count,amount:item.amount};
  }
  for(const row of rows){
    let tc=0,ta=0;
    for(const d of days){
      tc+=row.daysMap[d].count;
      ta+=row.daysMap[d].amount;
    }
    row.totalCount = tc;
    row.totalAmount = ta;
  }
  const stageTotals = new Map();
  for(const row of rows){
    if(!stageTotals.has(row.stage)) stageTotals.set(row.stage,{totalCount:0,totalAmount:0});
    const st = stageTotals.get(row.stage);
    st.totalCount += row.totalCount;
    st.totalAmount += row.totalAmount;
  }
  const stageNames = {pila:'Пила',kromka:'Кромка',prisadka:'Присадка',upakovka:'Упаковка',hdf:'Пила ХДФ'};
  let html = '<table class="matrix-table"><thead><tr><th>Этап / Сотрудник</th><th>Показатель</th>';
  for(const d of days) html += `<th>${formatHeader(d)}</th>`;
  html += '<th>Итого</th></tr></thead><tbody>';
  for(const row of rows){
    const stageDisplay = stageNames[row.stage]||row.stage;
    html += `<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td>`;
    html += '<td class="row-sub-label">кол-во</td>';
    for(const d of days){
      const v = row.daysMap[d];
      html += `<td class="count-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="count">${v.count===0?'':v.count}</td>`;
    }
    html += `<td class="count-cell">${row.totalCount===0?'':row.totalCount}</td></tr>`;
    html += `<tr><td class="row-sub-label">метраж</td>`;
    for(const d of days){
      const v = row.daysMap[d];
      html += `<td class="amount-cell" data-stage="${row.stage}" data-employee="${row.employee}" data-date="${d}" data-field="amount">${v.amount===0?'':v.amount}</td>`;
    }
    html += `<td class="amount-cell">${row.totalAmount===0?'':row.totalAmount}</td></tr>`;
  }
  for(const [sk,tot] of stageTotals.entries()){
    const stageDisplay = stageNames[sk]||sk;
    html += `<tr><td colspan="2" class="row-label" style="background:#3a3a46;">${stageDisplay} (всего)</td>`;
    for(let i=0;i<days.length;i++) html += '<td></td>';
    html += `<td class="count-cell">${tot.totalCount===0?'':tot.totalCount}</td></tr>`;
    html += `<tr><td colspan="2" class="row-label" style="background:#3a3a46;"></td>`;
    for(let i=0;i<days.length;i++) html += '<td></td>';
    html += `<td class="amount-cell">${tot.totalAmount===0?'':tot.totalAmount}</td></tr>`;
  }
  html += '</tbody></table>';
  matrixContainer.innerHTML = html;
  attachEditHandlers();
  setLoading(false);
}

function attachEditHandlers(){
  const cells = document.querySelectorAll('.count-cell, .amount-cell');
  cells.forEach(cell=>{
    if(!cell.dataset.stage) return;
    cell.style.cursor = 'pointer';
    if(cell._listener) cell.removeEventListener('click',cell._listener);
    const handler = async (e)=>{
      e.stopPropagation();
      const stage = cell.dataset.stage;
      const employee = cell.dataset.employee;
      const dateStr = cell.dataset.date;
      const field = cell.dataset.field;
      const currentValue = cell.innerText===''?0:parseFloat(cell.innerText);
      const isAdmin = adminModeCheckbox.checked;
      const currentUser = employeeSelect.value;
      if(!isAdmin && currentUser!==employee){
        alert('Редактировать можно только свои данные (или включите режим администратора)');
        return;
      }
      const action = prompt(`Что сделать?\n1 - Изменить ${field==='count'?'количество':'метраж'}\n2 - Удалить запись за этот день`,'1');
      if(action===null) return;
      if(action==='2'){
        if(!confirm(`Удалить данные за ${dateStr} для ${employee} (${stage})?`)) return;
        setLoading(true,'Удаление...');
        try{
          const snap = await db.collection('daily_totals')
            .where('date','==',dateStr)
            .where('employee','==',employee)
            .where('stage','==',stage)
            .get();
          if(!snap.empty){
            await db.collection('daily_totals').doc(snap.docs[0].id).delete();
            alert('Запись удалена');
            await loadReports();
          }else alert('Запись не найдена');
        }catch(err){ alert('Ошибка удаления: '+err.message); }
        finally{ setLoading(false); }
        return;
      }
      if(action==='1'){
        const newValue = prompt(`Введите новое значение для ${field==='count'?'количества заказов':'метража'} (текущее: ${currentValue}):`,currentValue);
        if(newValue===null) return;
        const num = parseFloat(newValue);
        if(isNaN(num)){ alert('Введите число'); return; }
        setLoading(true,'Обновление...');
        try{
          const snap = await db.collection('daily_totals')
            .where('date','==',dateStr)
            .where('employee','==',employee)
            .where('stage','==',stage)
            .get();
          if(snap.empty){
            await db.collection('daily_totals').add({
              date:dateStr, employee, stage,
              count: field==='count' ? num : 0,
              amount: field==='amount' ? num : 0,
              timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
          }else{
            const id = snap.docs[0].id;
            const upd = {};
            if(field==='count') upd.count = num;
            else upd.amount = num;
            await db.collection('daily_totals').doc(id).update(upd);
          }
          alert('Обновлено');
          await loadReports();
        }catch(err){ alert('Ошибка: '+err.message); }
        finally{ setLoading(false); }
      }else alert('Неверный выбор');
    };
    cell.addEventListener('click',handler);
    cell._listener = handler;
  });
}

async function exportToExcel(){
  const from = filterDateFrom.value;
  const to = filterDateTo.value;
  if(!from || !to){ alert('Выберите период'); return; }
  const stageFilter = filterStage.value;
  const employeeFilter = filterEmployeeSelect.value;
  setLoading(true,'Экспорт...');
  const allData = await loadAllData();
  let links = await loadAllLinks();
  if(links.length===0) await migrateLinks();
  links = await loadAllLinks();
  const days = generateDateRange(from,to);
  if(stageFilter!=='all') links = links.filter(l=>l.stage===stageFilter);
  if(employeeFilter) links = links.filter(l=>l.employee===employeeFilter);
  links.sort((a,b)=>{
    if(a.stage===b.stage) return a.employee.localeCompare(b.employee);
    return a.stage.localeCompare(b.stage);
  });
  const rows = links.map(link=>{
    const dm={};
    for(const d of days) dm[d]={count:0,amount:0};
    return {stage:link.stage,employee:link.employee,daysMap:dm};
  });
  for(const item of allData){
    if(!days.includes(item.date)) continue;
    const row = rows.find(r=>r.stage===item.stage && r.employee===item.employee);
    if(row) row.daysMap[item.date]={count:item.count,amount:item.amount};
  }
  for(const row of rows){
    let tc=0,ta=0;
    for(const d of days){ tc+=row.daysMap[d].count; ta+=row.daysMap[d].amount; }
    row.totalCount = tc; row.totalAmount = ta;
  }
  const stageTotals = new Map();
  for(const row of rows){
    if(!stageTotals.has(row.stage)) stageTotals.set(row.stage,{totalCount:0,totalAmount:0});
    const st = stageTotals.get(row.stage);
    st.totalCount += row.totalCount; st.totalAmount += row.totalAmount;
  }
  const stageNames = {pila:'Пила',kromka:'Кромка',prisadka:'Присадка',upakovka:'Упаковка',hdf:'Пила ХДФ'};
  let lines = [];
  lines.push('<html><head><meta charset="UTF-8"><title>Итоги</title>');
  lines.push('<style>body{font-family:Calibri;margin:20px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #7f8c8d;padding:6px;text-align:center} th{background:#f2c94c} .row-label{background:#e9ecef;text-align:left} .row-sub-label{background:#e9ecef}</style>');
  lines.push('</head><body>');
  lines.push(`<h2>Итоги за ${from} — ${to}</h2>`);
  lines.push('<table><thead><tr><th>Этап / Сотрудник</th><th>Показатель</th>');
  for(const d of days) lines.push(`<th>${formatHeader(d)}</th>`);
  lines.push('<th>Итого</th></tr></thead><tbody>');
  for(const row of rows){
    const stageDisplay = stageNames[row.stage]||row.stage;
    lines.push(`<tr><td rowspan="2" class="row-label">${stageDisplay}<br>${escapeHtml(row.employee)}</td><td class="row-sub-label">кол-во</td>`);
    for(const d of days){
      const v = row.daysMap[d];
      lines.push(`<td>${v.count===0?'':v.count}</td>`);
    }
    lines.push(`<td>${row.totalCount===0?'':row.totalCount}</td></tr>`);
    lines.push(`<tr><td class="row-sub-label">метраж</td>`);
    for(const d of days){
      const v = row.daysMap[d];
      lines.push(`<td>${v.amount===0?'':v.amount}</td>`);
    }
    lines.push(`<td>${row.totalAmount===0?'':row.totalAmount}</td></tr>`);
  }
  for(const [sk,tot] of stageTotals.entries()){
    const stageDisplay = stageNames[sk]||sk;
    lines.push(`<tr><td colspan="2" class="row-label">${stageDisplay} (всего)</td>`);
    for(let i=0;i<days.length;i++) lines.push('<td></td>');
    lines.push(`<td>${tot.totalCount===0?'':tot.totalCount}</td></tr>`);
    lines.push(`<tr><td colspan="2" class="row-label"></td>`);
    for(let i=0;i<days.length;i++) lines.push('<td></td>');
    lines.push(`<td>${tot.totalAmount===0?'':tot.totalAmount}</td></tr>`);
  }
  lines.push('</tbody></table></body></html>');
  const html = lines.join('');
  const blob = new Blob([html],{type:'application/vnd.ms-excel'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `totals_${from}_${to}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
  setLoading(false);
}

function switchTab(tab){
  if(tab==='input'){
    inputPanel.style.display='block';
    reportsPanel.style.display='none';
    tabInput.classList.add('active');
    tabReports.classList.remove('active');
  }else{
    inputPanel.style.display='none';
    reportsPanel.style.display='block';
    tabReports.classList.add('active');
    tabInput.classList.remove('active');
    loadReports();
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>]/g, m=> m==='&'?'&amp;': m==='<'?'&lt;':'&gt;');
}

adminBtn.onclick = ()=>{ renderAdminModal(); adminModal.style.display='block'; };
closeModal.onclick = ()=> adminModal.style.display='none';
window.onclick = (e)=>{ if(e.target===adminModal) adminModal.style.display='none'; };
addEmployeeBtn.onclick = ()=>{
  const name = newEmployeeName.value.trim();
  if(name) addEmployee(name);
  newEmployeeName.value = '';
};
resetEmployeesBtn.onclick = resetToDefaultEmployees;

document.addEventListener('DOMContentLoaded',async ()=>{
  await loadEmployeesList();
  await migrateLinks();
  saveBtn.onclick = saveTotals;
  applyFiltersBtn.onclick = loadReports;
  exportExcelBtn.onclick = exportToExcel;
  tabInput.onclick = ()=>switchTab('input');
  tabReports.onclick = ()=>switchTab('reports');
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('service-worker.js')
    .then(reg=>console.log('SW registered',reg))
    .catch(err=>console.error('SW registration failed',err));
}
