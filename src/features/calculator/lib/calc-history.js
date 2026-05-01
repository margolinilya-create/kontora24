const STORAGE_KEY = 'kontora24-calc-history'
const MAX_ITEMS = 10

export function saveCalcToHistory(form, result) {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const entry = {
      id: Date.now(),
      ...form,
      priceFinal: result.priceFinal,
      pricePerUnit: result.pricePerUnit,
      timestamp: new Date().toISOString(),
    }
    history.unshift(entry)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ITEMS)))
  } catch { /* ignored */ }
}

export function loadCalcHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

export function clearCalcHistory() {
  localStorage.removeItem(STORAGE_KEY)
}
