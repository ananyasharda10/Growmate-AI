import type { Currency } from "../types";

const SYMBOLS: Record<Currency, string> = {
  USD: "$",
  INR: "₹",
};

export function currencySymbol(currency: Currency): string {
  return SYMBOLS[currency];
}

// Digit grouping is tied to the currency, not the browser's locale — otherwise INR amounts
// render with Western thousands-grouping (999,999,999) instead of the Indian lakh/crore
// grouping (9,99,99,999) that this figure would actually be read in.
const GROUPING_LOCALE: Record<Currency, string> = {
  INR: "en-IN",
  USD: "en-US",
};

export function formatMoney(amount: number, currency: Currency): string {
  const symbol = currencySymbol(currency);
  const value = Number.isFinite(amount) ? amount : 0;
  return `${symbol}${value.toLocaleString(GROUPING_LOCALE[currency], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
