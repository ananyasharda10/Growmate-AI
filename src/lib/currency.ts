import type { Currency } from "../types";

const SYMBOLS: Record<Currency, string> = {
  USD: "$",
  INR: "₹",
};

export function currencySymbol(currency: Currency): string {
  return SYMBOLS[currency];
}

export function formatMoney(amount: number, currency: Currency): string {
  const symbol = currencySymbol(currency);
  const value = Number.isFinite(amount) ? amount : 0;
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
