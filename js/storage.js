const STORAGE_KEY = 'expense-tagger-merchants';

function getMerchantMemory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function setMerchantShared(merchantKey, isShared) {
  const memory = getMerchantMemory();
  memory[merchantKey] = isShared;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}
