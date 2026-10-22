const numberFormat = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/** Visible price text, e.g. "3,000" or ["4,000", "5,000"] for a range. */
export function priceParts(min: number, max: number | null): string[] {
  return max === null ? [formatNumber(min)] : [formatNumber(min), formatNumber(max)];
}

/** Screen-reader label (Arabic), same wording as v1. */
export function priceLabel(min: number, max: number | null): string {
  return max === null
    ? `${formatNumber(min)} دينار`
    : `من ${formatNumber(min)} إلى ${formatNumber(max)} دينار`;
}

/** Arabic count label with correct number agreement (v1 wording). */
export function itemsLabel(n: number): string {
  if (n === 1) return "صنف واحد";
  if (n === 2) return "صنفان";
  if (n <= 10) return `${n} أصناف`;
  return `${n} صنفاً`;
}
