/**
 * Sales Report Page
 * Top: bar chart of product counts per sales-volume bucket.
 * Bottom: product list for the selected bucket.
 * On load, defaults to the highest-sales bucket that has products.
 */

const $ = id => document.getElementById(id);

const store = {
  buckets: [],          // SalesBucketDTO[]
  selectedBucket: null, // number | null
};

// ── Data fetching ───────────────────────────────────────────────────────────

async function fetchDistribution() {
  const res = await fetch('/api/report/sales/distribution');
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || `加载失败 (${res.status})`);
  }
  return data;
}

async function fetchProducts(bucketIndex) {
  const res = await fetch(`/api/report/sales/products?bucket=${encodeURIComponent(bucketIndex)}`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || `加载失败 (${res.status})`);
  }
  return data;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderChart() {
  const chart = $('chart');
  chart.innerHTML = '';

  const maxCount = store.buckets.reduce((m, b) => Math.max(m, b.count), 0);

  store.buckets.forEach(bucket => {
    const col = document.createElement('div');
    col.className = 'bar-col';
    if (bucket.index === store.selectedBucket) col.classList.add('active');
    col.setAttribute('role', 'listitem');
    col.tabIndex = 0;
    col.setAttribute('aria-label', `${bucket.label}: ${bucket.count} 件商品`);

    const count = document.createElement('div');
    count.className = 'bar-count';
    count.textContent = String(bucket.count);

    const barWrap = document.createElement('div');
    barWrap.className = 'bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'bar';
    // Height as a percentage of the tallest bar; keep a small floor so 0 is visible.
    const pct = maxCount > 0 ? Math.round((bucket.count / maxCount) * 100) : 0;
    bar.style.height = `${Math.max(pct, bucket.count > 0 ? 4 : 0)}%`;
    barWrap.appendChild(bar);

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = bucket.label;

    col.appendChild(count);
    col.appendChild(barWrap);
    col.appendChild(label);

    col.addEventListener('click', () => selectBucket(bucket.index));
    col.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectBucket(bucket.index);
      }
    });

    chart.appendChild(col);
  });
}

function renderProductList(data) {
  const title = $('list-title');
  title.textContent = `商品列表 · ${data.label}（${data.products.length}）`;

  const container = $('product-list-container');
  container.innerHTML = '';

  if (data.products.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-hint';
    p.textContent = '该区间暂无商品';
    container.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th>ProductID</th><th>商品名</th><th>分类</th><th>品牌</th><th>价格</th><th>销量</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  data.products.forEach(p => {
    const tr = document.createElement('tr');
    [
      p.ProductID ?? '',
      p.ProductName ?? '',
      p.Category ?? '',
      p.Brand ?? '',
      p.Price != null ? String(p.Price) : '',
      p.SalesVolume != null ? String(p.SalesVolume) : '0',
    ].forEach(text => {
      const td = document.createElement('td');
      td.textContent = text; // textContent prevents XSS
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

// ── Interaction ─────────────────────────────────────────────────────────────

async function selectBucket(bucketIndex) {
  store.selectedBucket = bucketIndex;
  renderChart(); // refresh active highlight
  try {
    const data = await fetchProducts(bucketIndex);
    renderProductList(data);
  } catch (err) {
    showError(err.message);
  }
}

function showError(msg) {
  const el = $('report-error');
  el.textContent = msg || '未知错误';
  el.style.display = 'block';
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  $('report-loading').style.display = 'block';
  try {
    const dist = await fetchDistribution();
    store.buckets = dist.buckets;
    store.selectedBucket = dist.defaultBucket;

    $('section-chart').style.display = 'block';
    $('section-list').style.display = 'block';
    renderChart();

    const products = await fetchProducts(dist.defaultBucket);
    renderProductList(products);
  } catch (err) {
    showError(err.message);
  } finally {
    $('report-loading').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', init);
