// Currency and Number Formatters
// Global currency configuration: ZAR (South African Rand)

export const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const currencyFormatterWithDecimals = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatCurrency = (amount: number, withDecimals = false): string => {
  return withDecimals 
    ? currencyFormatterWithDecimals.format(amount)
    : currencyFormatter.format(amount);
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('en-ZA').format(value);
};

export const formatPercentage = (value: number): string => {
  return new Intl.NumberFormat('en-ZA', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
};
