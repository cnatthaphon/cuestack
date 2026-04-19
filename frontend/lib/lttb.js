/**
 * LTTB — Largest Triangle Three Buckets
 *
 * Downsamples time-series data while preserving visual shape.
 * The algorithm picks the point in each bucket that forms the
 * largest triangle with its neighbors — keeping peaks, valleys,
 * and inflection points that matter visually.
 *
 * Used by Plotly, Grafana, TimescaleDB, and most production
 * time-series visualization tools.
 *
 * Reference: Sveinn Steinarsson, "Downsampling Time Series for
 * Visual Representation" (2013), University of Iceland.
 *
 * @param {Array} data - Array of [x, y] pairs or {x, y} objects
 * @param {number} threshold - Target number of output points
 * @returns {Array} Downsampled data in same format as input
 */
export function lttb(data, threshold) {
  if (!data || data.length === 0) return [];
  if (threshold >= data.length || threshold <= 2) return data.slice();

  const isObj = typeof data[0] === "object" && !Array.isArray(data[0]);
  const getX = isObj ? (d) => d.x : (d) => d[0];
  const getY = isObj ? (d) => d.y : (d) => d[1];

  const sampled = [];
  const len = data.length;

  // Always include first point
  sampled.push(data[0]);

  // Bucket size (excluding first and last points)
  const bucketSize = (len - 2) / (threshold - 2);

  let a = 0; // Index of previous selected point

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate bucket boundaries
    const bucketStart = Math.floor((i + 0) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, len - 1);

    // Next bucket average (for triangle area calculation)
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, len - 1);

    let avgX = 0, avgY = 0, count = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += getX(data[j]);
      avgY += getY(data[j]);
      count++;
    }
    if (count > 0) { avgX /= count; avgY /= count; }

    // Find point in current bucket with largest triangle area
    const pointAX = getX(data[a]);
    const pointAY = getY(data[a]);

    let maxArea = -1;
    let maxIdx = bucketStart;

    for (let j = bucketStart; j < bucketEnd; j++) {
      // Triangle area = 0.5 * |x_a(y_j - y_avg) + x_j(y_avg - y_a) + x_avg(y_a - y_j)|
      const area = Math.abs(
        (pointAX - avgX) * (getY(data[j]) - pointAY) -
        (pointAX - getX(data[j])) * (avgY - pointAY)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
    a = maxIdx;
  }

  // Always include last point
  sampled.push(data[len - 1]);

  return sampled;
}

/**
 * Downsample parallel arrays (labels[], values[]) using LTTB.
 * This is the format our chart widgets use.
 *
 * @param {string[]} labels - X-axis labels
 * @param {number[]} values - Y-axis values
 * @param {number} threshold - Target points
 * @returns {{ labels: string[], values: number[], downsampled: boolean, original: number }}
 */
export function lttbArrays(labels, values, threshold) {
  if (!values || values.length <= threshold) {
    return { labels, values, downsampled: false, original: values?.length || 0 };
  }

  // Build [index, value] pairs for LTTB (use index as X for uniform spacing)
  const data = values.map((v, i) => [i, v]);
  const sampled = lttb(data, threshold);

  // Extract indices and rebuild arrays
  const indices = sampled.map((p) => Math.round(p[0]));
  return {
    labels: indices.map((i) => labels[i]),
    values: indices.map((i) => values[i]),
    downsampled: true,
    original: values.length,
  };
}

/**
 * Downsample multiple series (for multi-series charts).
 * Each series shares the same labels array.
 *
 * @param {string[]} labels
 * @param {Array<{label: string, values: number[], color?: string}>} series
 * @param {number} threshold
 * @returns {{ labels: string[], series: Array, downsampled: boolean, original: number }}
 */
export function lttbSeries(labels, series, threshold) {
  if (!series || series.length === 0 || !labels || labels.length <= threshold) {
    return { labels, series, downsampled: false, original: labels?.length || 0 };
  }

  // For multi-series: merge all series to find "most important" indices.
  // Use the series with highest variance as the primary for LTTB selection,
  // then extract same indices from all series.
  let primaryIdx = 0;
  let maxVariance = 0;
  for (let s = 0; s < series.length; s++) {
    const vals = series[s].values || [];
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length || 1);
    if (variance > maxVariance) { maxVariance = variance; primaryIdx = s; }
  }

  // Run LTTB on primary series
  const primaryValues = series[primaryIdx].values || [];
  const data = primaryValues.map((v, i) => [i, v]);
  const sampled = lttb(data, threshold);
  const indices = sampled.map((p) => Math.round(p[0]));

  // Extract same indices from all series
  return {
    labels: indices.map((i) => labels[i]),
    series: series.map((s) => ({
      ...s,
      values: indices.map((i) => (s.values || [])[i]),
    })),
    downsampled: true,
    original: labels.length,
  };
}
