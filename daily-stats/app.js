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
      <tr>
        <thead>
          <tr>
            <th>Этап / Сотрудник</th>
            <th>Показатель</th>`;
  for (const d of days) {
    html += `<th>${formatHeader(d)}</th>`;
  }
  html += `<th>Итого</th>`;
  html += `</tr></thead>
        <tbody>`;

  // Строки сотрудников
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

  // Итоги по этапам (две строки)
  for (const [stageKey, totals] of stageTotals.entries()) {
    const stageDisplay = stageNames[stageKey] || stageKey;
    const totalCount = totals.totalCount === 0 ? '' : totals.totalCount;
    const totalAmount = totals.totalAmount === 0 ? '' : totals.totalAmount;
    
    html += `<tr><td colspan="2" class="row-label" style="background:#e9ecef;">${stageDisplay} (всего)<\/td>`;
    for (let i = 0; i < days.length; i++) {
      html += `<td><\/td>`;
    }
    html += `<td class="count-cell">${totalCount}<\/td>`;
    html += `<\/tr>`;
    
    html += `<tr><td colspan="2" class="row-label" style="background:#e9ecef;"><\/td>`;
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
