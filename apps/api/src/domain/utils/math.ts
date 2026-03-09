export const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const stdDev = (values: number[]): number => {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
};

export const maxDrawdown = (returns: number[]): number => {
  let peak = 1;
  let equity = 1;
  let drawdown = 0;

  for (const value of returns) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, (peak - equity) / peak);
  }

  return drawdown;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
