/**
 * Reusable review-count report widget.
 * Fetches GET /api/report/review-count and renders a bar chart + data table
 * into the given root element. Shared by the standalone report page and the
 * embedded report section on the home (import) page. Pure DOM / CSS.
 */

function buildSummary(report) {
  const el = document.createElement('div');
  el.className = 'summary-bar';
  const items = [
    { label: '商品总数', value: report.totalProducts },
    { label: '已统计', value: report.counted },
    { label: '无评论数', value: report.missingReviewCount },
  ];
  items.forEach(({ label, value }) => {
    const span = document.createElement('span');
    span.className = 'stat';
    span.textContent = `${label}: ${value}`;
    el.appendChild(span);
  });
  return el;
}

function buildChart(buckets) {
  const chart = document.createElement('div');
  chart.className = 'chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', '商品评论数区间柱形图');

  const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0);

  buckets.forEach(bucket => {
    const col = document.createElement('div');
    col.className = 'chart-col';

    const value = document.createElement('div');
    value.className = 'chart-value';
    value.textContent = String(bucket.count);

    const barWrap = document.createElement('div');
    barWrap.className = 'chart-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    const heightPct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
    bar.style.height = `${heightPct}%`;
    bar.title = `${bucket.label}: ${bucket.count}`;
    barWrap.appendChild(bar);

    const label = document.createElement('div');
    label.className = 'chart-label';
    label.textContent = bucket.label;

    col.appendChild(value);
    col.appendChild(barWrap);
    col.appendChild(label);
    chart.appendChild(col);
  });
  return chart;
}

function buildTable(buckets, counted) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>评论数区间</th><th>商品个数</th><th>占比</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  buckets.forEach(bucket => {
    const tr = document.createElement('tr');
    const pct = counted > 0 ? ((bucket.count / counted) * 100).toFixed(1) : '0.0';
    [bucket.label, String(bucket.count), `${pct}%`].forEach(text => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

/**
 * Load the report and render it into `rootEl`. Safe to call repeatedly
 * (e.g. to refresh after an import). Shows loading / error states inline.
 */
export async function renderReport(rootEl) {
  if (!rootEl) return;

  rootEl.innerHTML = '';
  const status = document.createElement('div');
  status.className = 'loading';
  status.textContent = '正在加载报表...';
  rootEl.appendChild(status);

  let data;
  try {
    const res = await fetch('/api/report/review-count');
    data = await res.json();
    if (!res.ok || !data.success) {
      status.className = 'error-msg';
      status.textContent = data.message || `加载失败 (${res.status})`;
      return;
    }
  } catch (err) {
    status.className = 'error-msg';
    status.textContent = `网络错误: ${err.message}`;
    return;
  }

  const report = data.report;
  rootEl.innerHTML = '';
  rootEl.appendChild(buildSummary(report));
  rootEl.appendChild(buildChart(report.buckets));
  rootEl.appendChild(buildTable(report.buckets, report.counted));
}
