/**
 * Currency Formatter Utility
 * Formats numbers as South African Rands (R)
 */

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount).replace('ZAR', 'R');
};
