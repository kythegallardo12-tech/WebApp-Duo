export function formatMoney(value, currency = 'USD', compact = false) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 1 : 2,
    ...(compact ? { notation: 'compact' } : {}),
  }).format(Number(value) || 0);
}

export function currencySymbol(currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0).find(part => part.type === 'currency').value;
}
