/**
 * Product Review-Count Report page.
 * Fetches GET /api/report/review-count and renders a bar chart + data table.
 * Pure DOM / CSS — no external chart library.
 */

const $ = id => document.getElementById(id);

async function loadReport() {
  try {
    const res = await fetch('/api/report/review-count');
    const data = await res.json();

    if (!res.ok || !data.success) {
      showError(data.message || `加载失败 (${res.status})`);
      return;
    }
    render(data.report);
  } catch (err) {
    showError(`网络错误: ${err.message}`);
  }
}

function showError(msg) {
  $('report-loading').style.display = 'none';
  $('report-content').style.display = 'none';
  const el = $('report-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function render(report) {
  $('report-loading').style.display = 'none';
  $('report-error').style.display = 'none';
  $('report-content').style.display = 'block';

  renderSummary(report);
  renderChart(report.buckets);
  renderTable(report.buckets, report.counted);
}

function renderSummary(report) {
  const el = $('report-summary');
  el.innerHTML = '';
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
}

function renderChart(buckets) {
  const chart = $('chart');
  chart.innerHTML = '';

  const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0);

  buckets.forEach(bucket => {
    const col = document.createElement('div');
    col.className = 'chart-col';

    // Numeric value shown above the bar
    const value = document.createElement('div');
    value.className = 'chart-value';
    value.textContent = String(bucket.count);

    // The bar itself; height is proportional to the max count.
    const barWrap = document.createElement('div');
    barWrap.className = 'chart-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    const heightPct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
    bar.style.height = `${heightPct}%`;
    bar.title = `${bucket.label}: ${bucket.count}`;
    barWrap.appendChild(bar);

    // X-axis label
    const label = document.createElement('div');
    label.className = 'chart-label';
    label.textContent = bucket.label;

    col.appendChild(value);
    col.appendChild(barWrap);
    col.appendChild(label);
    chart.appendChild(col);
  });
}

function renderTable(buckets, counted) {
  const tbody = $('report-table').querySelector('tbody');
  tbody.innerHTML = '';
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
}

document.addEventListener('DOMContentLoaded', loadReport);
