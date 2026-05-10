function parseCSVText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some(f => f !== '')) rows.push(row);
  }
  return rows;
}

function detectBank(headers) {
  const h = headers.map(x => x.toLowerCase().trim());
  // Amex: unique 'extended details' column
  if (h.some(x => x.includes('extended details') || x.includes('appears on your statement'))) return 'amex';
  // BofA credit card: has 'reference number' and 'payee', no 'description'
  if (h.includes('reference number') && h.includes('payee')) return 'bofa_credit';
  // Alliant Visa: Date + Description + Amount + Balance + Post Date (two date columns)
  if (h.includes('date') && h.includes('post date') && h.includes('description')) return 'alliant_visa';
  // Alliant Checking: Date + Description + Amount + Balance (parentheses amounts)
  if (h.includes('date') && h.includes('description') && h.includes('amount') && h.includes('balance')) return 'alliant_checking';
  return 'unknown';
}

function normalizeDate(str) {
  if (!str) return '';
  str = str.trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return str;
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return str;
}

function parseAmount(str) {
  if (!str) return null;
  str = str.trim();
  // Alliant Checking uses ($2.99) for withdrawals
  const isParens = str.startsWith('(') && str.endsWith(')');
  const cleaned = str.replace(/[$,\s()]/g, '');
  const val = parseFloat(cleaned);
  if (isNaN(val)) return null;
  return isParens ? -val : val;
}

function normalizeMerchant(desc) {
  let s = desc.toLowerCase().trim();
  s = s.replace(/^(sq \*|tst\*|tst \*|sp |pp\*|paypal \*|vzwrlss\*|amzn mktp us\*|amazon\.com\*|uber \*|lyft \*|dsh\*|dd\/br\*)/i, '');
  s = s.replace(/\s+#\d+.*$/, '');
  s = s.replace(/\s+\d{5,}.*$/, '');
  return s.trim();
}

function findCol(headers, ...names) {
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());
    if (idx >= 0) return idx;
  }
  for (const name of names) {
    const idx = headers.findIndex(h => h.toLowerCase().trim().includes(name.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseTransactions(text, filename) {
  const rows = parseCSVText(text);
  if (rows.length < 2) return { bank: 'unknown', transactions: [] };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    if (rows[i].some(f => /date|description|payee|amount|debit|credit/i.test(f))) {
      headerIdx = i;
      break;
    }
  }

  const headers = rows[headerIdx];
  const bank = detectBank(headers);
  const dataRows = rows.slice(headerIdx + 1);
  const transactions = [];

  if (bank === 'alliant_visa') {
    // Date,Description,Amount,Balance,Post Date — CSV: positive = charge. Canonical: amount > 0 = debit, so pass through
    const dateCol = findCol(headers, 'date');
    const descCol = findCol(headers, 'description');
    const amountCol = findCol(headers, 'amount');

    for (const row of dataRows) {
      const amount = parseAmount(row[amountCol]);
      if (amount === null || amount === 0) continue;
      const desc = (row[descCol] || '').trim();
      transactions.push({
        date: normalizeDate(row[dateCol]),
        description: desc,
        amount,
        merchantKey: normalizeMerchant(desc),
        source: filename,
      });
    }
  } else if (bank === 'alliant_checking') {
    // Date,Description,Amount,Balance — CSV: ($x) = withdrawal, $x = deposit. Canonical: amount > 0 = debit, so negate
    const dateCol = findCol(headers, 'date');
    const descCol = findCol(headers, 'description');
    const amountCol = findCol(headers, 'amount');

    for (const row of dataRows) {
      const amount = parseAmount(row[amountCol]);
      if (amount === null || amount === 0) continue;
      const desc = (row[descCol] || '').trim();
      transactions.push({
        date: normalizeDate(row[dateCol]),
        description: desc,
        amount: -amount,
        merchantKey: normalizeMerchant(desc),
        source: filename,
      });
    }
  } else if (bank === 'bofa_credit') {
    // Posted Date,Reference Number,Payee,Address,Amount — CSV: negative = charge, positive = refund. Canonical: amount > 0 = debit, so negate
    const dateCol = findCol(headers, 'posted date');
    const descCol = findCol(headers, 'payee');
    const amountCol = findCol(headers, 'amount');

    for (const row of dataRows) {
      const amount = parseAmount(row[amountCol]);
      if (amount === null || amount === 0) continue;
      const desc = (row[descCol] || '').trim();
      transactions.push({
        date: normalizeDate(row[dateCol]),
        description: desc,
        amount: -amount,
        merchantKey: normalizeMerchant(desc),
        source: filename,
      });
    }
  } else if (bank === 'amex') {
    // Date,Description,Amount,Extended Details,... — CSV: positive = charge, negative = credit. Canonical: amount > 0 = debit, so pass through
    const dateCol = findCol(headers, 'date');
    const amountCol = findCol(headers, 'amount');
    const descCol = findCol(headers, 'description');

    for (const row of dataRows) {
      const amount = parseAmount(row[amountCol]);
      if (amount === null || amount === 0) continue;
      const desc = (row[descCol] || '').trim();
      transactions.push({
        date: normalizeDate(row[dateCol]),
        description: desc,
        amount,
        merchantKey: normalizeMerchant(desc),
        source: filename,
      });
    }
  } else {
    // Generic fallback — assume amount sign as-is
    const dateCol = findCol(headers, 'date', 'posted date', 'transaction date');
    const amountCol = findCol(headers, 'amount');
    const descCol = findCol(headers, 'description', 'payee', 'memo');

    if (dateCol >= 0 && amountCol >= 0) {
      for (const row of dataRows) {
        const amount = parseAmount(row[amountCol]);
        if (amount === null || amount === 0) continue;
        const desc = descCol >= 0 ? (row[descCol] || '').trim() : '';
        transactions.push({
          date: normalizeDate(row[dateCol]),
          description: desc,
          amount,
          merchantKey: normalizeMerchant(desc),
          source: filename,
        });
      }
    }
  }

  return { bank, transactions };
}

function bankLabel(bank) {
  return {
    alliant_visa: 'Alliant Visa',
    alliant_checking: 'Alliant Checking',
    bofa_credit: 'Bank of America',
    amex: 'American Express',
    unknown: 'Unknown Bank',
  }[bank] || 'Unknown';
}
