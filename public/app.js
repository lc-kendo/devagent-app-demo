/**
 * Product Bulk Import - Frontend Single Page App
 * State machine: IDLE → UPLOADING → PREVIEW → CONFIRMING → DONE | ERROR
 */

// ── State Machine ─────────────────────────────────────────────────────────────

const AppState = {
  IDLE: 'IDLE',
  UPLOADING: 'UPLOADING',
  PREVIEW: 'PREVIEW',
  CONFIRMING: 'CONFIRMING',
  DONE: 'DONE',
  ERROR: 'ERROR',
};

const store = {
  state: AppState.IDLE,
  previewData: null,  // PreviewResponse
  confirmData: null,  // ConfirmResponse
  error: null,        // string

  setState(patch) {
    Object.assign(this, patch);
    render();
  },
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const sections = {
  upload: $('section-upload'),
  preview: $('section-preview'),
  result: $('section-result'),
  error: $('section-error'),
};

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  // Hide all sections
  Object.values(sections).forEach(s => { if (s) s.style.display = 'none'; });

  switch (store.state) {
    case AppState.IDLE:
      show('section-upload');
      $('upload-error').style.display = 'none';
      $('upload-loading').style.display = 'none';
      $('csv-input').value = '';
      break;

    case AppState.UPLOADING:
      show('section-upload');
      $('upload-loading').style.display = 'block';
      $('csv-input').disabled = true;
      break;

    case AppState.PREVIEW:
      $('csv-input').disabled = false;
      show('section-preview');
      renderPreview(store.previewData);
      $('confirm-loading').style.display = 'none';
      // Enable/disable confirm button
      const hasValid = store.previewData?.summary?.valid > 0;
      $('btn-confirm').disabled = !hasValid;
      if (!hasValid) {
        $('btn-confirm').title = '所有行均无效，无法导入';
      } else {
        $('btn-confirm').title = '';
      }
      break;

    case AppState.CONFIRMING:
      show('section-preview');
      $('btn-confirm').disabled = true;
      $('confirm-loading').style.display = 'block';
      break;

    case AppState.DONE:
      show('section-result');
      renderResult(store.confirmData);
      break;

    case AppState.ERROR:
      $('csv-input').disabled = false;
      show('section-error');
      const detail = $('error-detail');
      if (detail) detail.textContent = store.error || '未知错误';
      break;
  }
}

function show(sectionId) {
  const el = $(sectionId);
  if (el) el.style.display = 'block';
}

// ── Preview Rendering ─────────────────────────────────────────────────────────

function renderPreview(data) {
  if (!data) return;
  const { summary, validRows, invalidRows } = data;

  // Summary bar
  const summaryEl = $('preview-summary');
  if (summaryEl) {
    summaryEl.innerHTML = '';
    const items = [
      { label: '总计', value: summary.total, cls: '' },
      { label: '合法', value: summary.valid, cls: 'valid' },
      { label: '非法', value: summary.invalid, cls: 'invalid' },
    ];
    items.forEach(({ label, value, cls }) => {
      const span = document.createElement('span');
      span.className = `stat ${cls}`.trim();
      span.textContent = `${label}: ${value}`;
      summaryEl.appendChild(span);
    });
  }

  // Invalid rows table
  const invalidContainer = $('invalid-rows-container');
  if (invalidContainer) {
    invalidContainer.innerHTML = '';
    if (invalidRows.length === 0) {
      const p = document.createElement('p');
      p.textContent = '无无效行';
      p.style.color = '#888';
      invalidContainer.appendChild(p);
    } else {
      const details = document.createElement('details');
      details.open = true;
      const summary2 = document.createElement('summary');
      summary2.textContent = `非法行 (${invalidRows.length})`;
      details.appendChild(summary2);

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>行号</th><th>ProductID</th><th>错误原因</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');

      invalidRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'invalid-row';

        const tdRow = document.createElement('td');
        tdRow.textContent = String(row.rowNumber);
        tr.appendChild(tdRow);

        const tdId = document.createElement('td');
        tdId.textContent = row.raw?.ProductID ?? '';  // textContent prevents XSS
        tr.appendChild(tdId);

        const tdErr = document.createElement('td');
        const ul = document.createElement('ul');
        ul.className = 'error-list';
        (row.errors || []).forEach(err => {
          const li = document.createElement('li');
          li.textContent = err;  // textContent prevents XSS
          ul.appendChild(li);
        });
        tdErr.appendChild(ul);
        tr.appendChild(tdErr);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      details.appendChild(table);
      invalidContainer.appendChild(details);
    }
  }

  // Valid rows (collapsible)
  const validContainer = $('valid-rows-container');
  if (validContainer) {
    validContainer.innerHTML = '';
    if (validRows.length > 0) {
      const details = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = `合法行 (${validRows.length})`;
      details.appendChild(sum);

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>行号</th><th>ProductID</th><th>商品名</th><th>价格</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');

      validRows.forEach(row => {
        const tr = document.createElement('tr');
        [
          String(row.rowNumber),
          row.product?.ProductID ?? '',
          row.product?.ProductName ?? '',
          String(row.product?.Price ?? ''),
        ].forEach(text => {
          const td = document.createElement('td');
          td.textContent = text;  // textContent prevents XSS
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      details.appendChild(table);
      validContainer.appendChild(details);
    }
  }
}

// ── Result Rendering ──────────────────────────────────────────────────────────

function renderResult(data) {
  if (!data) return;
  const { summary } = data;
  const container = $('result-summary');
  if (!container) return;
  container.innerHTML = '';

  const cards = [
    { label: '总计', value: summary.total },
    { label: '新增', value: summary.inserted },
    { label: '更新', value: summary.updated },
    { label: '跳过', value: summary.skipped },
  ];

  cards.forEach(({ label, value }) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = String(value);
    const lbl = document.createElement('div');
    lbl.className = 'label';
    lbl.textContent = label;
    card.appendChild(num);
    card.appendChild(lbl);
    container.appendChild(card);
  });
}

// ── Event Handlers ────────────────────────────────────────────────────────────

async function uploadFile(file) {
  store.setState({ state: AppState.UPLOADING });

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/import/preview', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok || !data.success) {
      const msg = data.message || `上传失败 (${res.status})`;
      store.setState({ state: AppState.ERROR, error: msg });
      return;
    }

    store.setState({ state: AppState.PREVIEW, previewData: data });
  } catch (err) {
    store.setState({ state: AppState.ERROR, error: `网络错误: ${err.message}` });
  }
}

async function confirmImport() {
  if (!store.previewData || store.previewData.summary.valid === 0) return;

  store.setState({ state: AppState.CONFIRMING });

  const rows = store.previewData.validRows.map(vr => vr.product);

  try {
    const res = await fetch('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      const msg = data.message || `导入失败 (${res.status})`;
      store.setState({ state: AppState.ERROR, error: msg });
      return;
    }

    store.setState({ state: AppState.DONE, confirmData: data });
  } catch (err) {
    store.setState({ state: AppState.ERROR, error: `网络错误: ${err.message}` });
  }
}

function resetToIdle() {
  store.setState({
    state: AppState.IDLE,
    previewData: null,
    confirmData: null,
    error: null,
  });
}

// ── Wire Up Events ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const csvInput = $('csv-input');
  if (csvInput) {
    csvInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Frontend pre-validation
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'csv') {
        store.setState({ state: AppState.ERROR, error: '仅支持 .csv 格式文件' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        store.setState({ state: AppState.ERROR, error: '文件大小不得超过 5MB' });
        return;
      }

      uploadFile(file);
    });
  }

  const btnConfirm = $('btn-confirm');
  if (btnConfirm) btnConfirm.addEventListener('click', confirmImport);

  const btnResetPreview = $('btn-reset-from-preview');
  if (btnResetPreview) btnResetPreview.addEventListener('click', resetToIdle);

  const btnImportAgain = $('btn-import-again');
  if (btnImportAgain) btnImportAgain.addEventListener('click', resetToIdle);

  const btnResetError = $('btn-reset-from-error');
  if (btnResetError) btnResetError.addEventListener('click', resetToIdle);

  // Initial render
  render();
});
