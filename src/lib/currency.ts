const GBP_FORMATTER = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function formatGbp(amount: number) {
  return GBP_FORMATTER.format(amount);
}

export function formatGbpRange(
  low: number | null | undefined,
  high: number | null | undefined
) {
  if (typeof low !== "number" || typeof high !== "number") return null;
  return `${formatGbp(low)} - ${formatGbp(high)}`;
}
