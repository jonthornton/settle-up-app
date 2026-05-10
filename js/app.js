const state = {
  transactions: [],
  pendingFiles: [],
  filter: 'all',
  focusedIdx: 0,
};

function init() {
  setupUploadArea();
  setupKeyboard();
  showScreen('upload');
}

// ── Upload screen ────────────────────────────────────────────────────────────

function setupUploadArea() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

  document.getElementById('load-btn').addEventListener('click', loadTransactions);
  document.getElementById('start-over-btn').addEventListener('click', startOver);
  document.getElementById('copy-btn').addEventListener('click', copyToClipboard);
  document.getElementById('filter-btn').addEventListener('click', toggleFilter);
}

function handleFiles(fileList) {
  Array.from(fileList).forEach(file => {
    if (!file.name.toLowerCase().endsWith('.csv')) return;
    if (state.pendingFiles.some(f => f.filename === file.name)) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const { bank, transactions } = parseTransactions(e.target.result, file.name);
      state.pendingFiles.push({ filename: file.name, bank, transactions });
      renderFileList();
      document.getElementById('load-btn').disabled = state.pendingFiles.length === 0;
    };
    reader.readAsText(file);
  });
}

function renderFileList() {
  const el = document.getElementById('file-list');
  el.innerHTML = '';
  state.pendingFiles.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <span class="file-name">${escapeHtml(f.filename)}</span>
      <span class="file-meta">${bankLabel(f.bank)} &middot; ${f.transactions.length} transactions</span>
      <button class="file-remove" aria-label="Remove file">&times;</button>
    `;
    item.querySelector('.file-remove').addEventListener('click', () => {
      state.pendingFiles.splice(i, 1);
      renderFileList();
      document.getElementById('load-btn').disabled = state.pendingFiles.length === 0;
    });
    el.appendChild(item);
  });
}

// ── Load & normalize ─────────────────────────────────────────────────────────

function loadTransactions() {
  const memory = getMerchantMemory();
  const all = [];

  state.pendingFiles.forEach(f => {
    f.transactions.forEach((t, i) => {
      const remembered = memory[t.merchantKey];
      all.push({
        ...t,
        id: `${f.filename}|${i}|${t.date}|${t.amount}`,
        isShared: remembered === true,
        autoTagged: remembered !== undefined,
      });
    });
  });

  all.sort((a, b) => toDate(b.date) - toDate(a.date));

  state.transactions = all;
  state.filter = 'all';
  state.focusedIdx = 0;

  showScreen('tagger');
  render();
}

function toDate(str) {
  const [m, d, y] = str.split('/');
  return new Date(+y, +m - 1, +d);
}

function formatAmount(n) {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
}

// ── Tagger screen ────────────────────────────────────────────────────────────

function getVisible() {
  return state.filter === 'shared'
    ? state.transactions.filter(t => t.isShared)
    : state.transactions;
}

function render() {
  renderTransactions();
  updateSummary();
}

function renderTransactions() {
  const list = document.getElementById('transaction-list');
  const visible = getVisible();

  if (visible.length === 0) {
    list.innerHTML = `<div class="empty-state">${state.filter === 'shared' ? 'No shared transactions yet. Toggle some rows to mark them shared.' : 'No transactions loaded.'}</div>`;
    return;
  }

  list.innerHTML = '';
  visible.forEach(t => {
    const realIdx = state.transactions.indexOf(t);
    const row = document.createElement('div');
    row.className = `tx-row${t.isShared ? ' shared' : ''}${realIdx === state.focusedIdx ? ' focused' : ''}`;
    row.dataset.idx = realIdx;

    row.innerHTML = `
      <span class="tx-date">${escapeHtml(t.date)}</span>
      <span class="tx-desc">${escapeHtml(t.description)}${t.autoTagged ? '<span class="auto-badge" title="Auto-tagged from memory">★</span>' : ''}</span>
      <span class="tx-amount">${formatAmount(t.amount)}</span>
      <button class="tx-toggle${t.isShared ? ' is-shared' : ''}" data-idx="${realIdx}">${t.isShared ? '✓ Shared' : 'Not shared'}</button>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('tx-toggle')) return;
      state.focusedIdx = realIdx;
      renderTransactions();
    });

    row.querySelector('.tx-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleShared(realIdx);
    });

    list.appendChild(row);
  });
}

function toggleShared(idx) {
  const t = state.transactions[idx];
  t.isShared = !t.isShared;
  t.autoTagged = false;
  setMerchantShared(t.merchantKey, t.isShared);

  // If filtering to shared-only and we just unshared, advance focus
  if (state.filter === 'shared' && !t.isShared) {
    const visible = getVisible();
    if (visible.length > 0) {
      const newVisIdx = Math.min(
        visible.findIndex((_, i) => state.transactions.indexOf(visible[i]) > idx),
        visible.length - 1
      );
      const safeIdx = newVisIdx < 0 ? visible.length - 1 : newVisIdx;
      state.focusedIdx = state.transactions.indexOf(visible[safeIdx]);
    }
  }

  render();
}

function updateSummary() {
  const shared = state.transactions.filter(t => t.isShared);
  const total = shared.reduce((s, t) => s + t.amount, 0);
  document.getElementById('shared-count').textContent = `${shared.length} shared`;
  document.getElementById('shared-total').textContent = formatAmount(total);
}

function toggleFilter() {
  state.filter = state.filter === 'all' ? 'shared' : 'all';
  const btn = document.getElementById('filter-btn');
  btn.textContent = state.filter === 'all' ? 'Show all' : 'Shared only';
  btn.classList.toggle('active', state.filter === 'shared');
  render();
}

// ── Export ───────────────────────────────────────────────────────────────────

function copyToClipboard() {
  const shared = state.transactions.filter(t => t.isShared);
  if (shared.length === 0) {
    showToast('No shared transactions to copy');
    return;
  }
  const total = shared.reduce((s, t) => s + t.amount, 0);
  const lines = shared.map(t => `${t.description}\t${t.date}\t${t.amount.toFixed(2)}`);
  lines.push(`Total\t\t${formatAmount(total)}`);
  const text = lines.join('\n');

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(`Copied ${shared.length} transactions`)).catch(() => fallbackCopy(text, shared.length));
  } else {
    fallbackCopy(text, shared.length);
  }
}

function fallbackCopy(text, count) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast(`Copied ${count} transactions`);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ── Reset ────────────────────────────────────────────────────────────────────

function startOver() {
  state.transactions = [];
  state.pendingFiles = [];
  state.focusedIdx = 0;
  state.filter = 'all';
  document.getElementById('file-list').innerHTML = '';
  document.getElementById('load-btn').disabled = true;
  showScreen('upload');
}

// ── Keyboard navigation ──────────────────────────────────────────────────────

function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('tagger-screen').hidden) return;
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;

    const visible = getVisible();
    const visIdx = visible.findIndex(t => state.transactions.indexOf(t) === state.focusedIdx);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (visIdx < visible.length - 1) {
          state.focusedIdx = state.transactions.indexOf(visible[visIdx + 1]);
          renderTransactions();
          scrollFocused();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (visIdx > 0) {
          state.focusedIdx = state.transactions.indexOf(visible[visIdx - 1]);
          renderTransactions();
          scrollFocused();
        }
        break;
      case ' ':
      case 's':
      case 'S':
        e.preventDefault();
        if (state.focusedIdx >= 0) toggleShared(state.focusedIdx);
        break;
    }
  });
}

function scrollFocused() {
  document.querySelector('.tx-row.focused')?.scrollIntoView({ block: 'nearest' });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function showScreen(name) {
  document.getElementById('upload-screen').hidden = name !== 'upload';
  document.getElementById('tagger-screen').hidden = name !== 'tagger';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
