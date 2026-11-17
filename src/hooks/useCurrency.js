import { useMemo } from 'react';
import useStore from '../store/useStore';
import { formatMoney, currencySymbol } from '../utils/currency';

export function useCurrency() {
  const currency = useStore(s => s.settings?.currency || 'USD');
  return useMemo(() => ({
    currency, symbol: currencySymbol(currency),
    money: value => formatMoney(value, currency),
    compactMoney: value => formatMoney(value, currency, true),
  }), [currency]);
}
