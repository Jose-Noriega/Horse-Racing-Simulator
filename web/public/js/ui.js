// UI helpers that don't touch the canvas.

// 12.5 -> '12.50', 12_500 -> '12.5K', 1_200_000 -> '1.2M'.
// Under 10K we show the full number so small bets stay exact.
export function shortNum(x, decimals = 2) {
  const sign = x < 0 ? "-" : "";
  x = Math.abs(x);
  // (cutoff, divisor, suffix). cutoffs sit just under the divisor so 999,999
  // shows 1M, not 1000K. K starts at 10K so 1,234.50 stays exact.
  for (const [cutoff, size, suffix] of [
    [0.99995e12, 1e12, "T"],
    [0.99995e9, 1e9, "B"],
    [0.99995e6, 1e6, "M"],
    [1e4, 1e3, "K"],
  ]) {
    if (x >= cutoff) {
      const text = (x / size).toFixed(1).replace(/\.0$/, ""); // "2M" not "2.0M"
      return `${sign}${text}${suffix}`;
    }
  }
  return `${sign}${x.toFixed(decimals)}`;
}

export function rgb(c, alpha = 1) {
  return alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
