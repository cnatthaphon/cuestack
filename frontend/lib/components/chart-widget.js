"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Filler, Legend, Tooltip, Title,
  LineController, BarController, PieController, DoughnutController, ScatterController,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import { lttbSeries } from "../lttb.js";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Filler, Legend, Tooltip, Title,
  LineController, BarController, PieController, DoughnutController, ScatterController,
  zoomPlugin,
);

// ─── Default palette ─────────────────────────────────────────────────────────
const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48",
];

export function getColor(index) {
  return PALETTE[index % PALETTE.length];
}

export { PALETTE };

// Max points to render (above this, LTTB kicks in)
const DOWNSAMPLE_THRESHOLD = 300;

// ─── Chart wrapper with LTTB downsampling + zoom-resample ────────────────────
export default function ChartWidget({ config, data, style }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const wrapperRef = useRef(null);
  const fullDataRef = useRef(null); // stores original full-resolution data

  const chartType = config?.chart_type || "line";
  const isPie = chartType === "pie" || chartType === "doughnut";
  const isZoomable = !isPie && (chartType === "line" || chartType === "area" || chartType === "scatter");

  // Downsample data with LTTB if needed
  const downsample = useCallback((labels, series, threshold) => {
    if (!labels || labels.length <= threshold) return { labels, series, downsampled: false };
    return lttbSeries(labels, series, threshold);
  }, []);

  // Build Chart.js data + options
  const { chartData, chartOptions, meta } = useMemo(() => {
    if (!data) return { chartData: null, chartOptions: {}, meta: {} };

    let labels = data.labels || [];
    let seriesData = data.series ? [...data.series] : [];
    if (seriesData.length === 0 && data.values) {
      seriesData.push({ label: config?.y_label || "Value", values: data.values });
    }

    // Store full-resolution data for zoom-resample
    fullDataRef.current = { labels: [...labels], series: seriesData.map((s) => ({ ...s, values: [...(s.values || [])] })) };

    const original = labels.length;
    let downsampled = false;

    // LTTB downsample if above threshold (skip for pie/bar)
    if (!isPie && chartType !== "bar" && labels.length > DOWNSAMPLE_THRESHOLD) {
      const ds = downsample(labels, seriesData, DOWNSAMPLE_THRESHOLD);
      labels = ds.labels;
      seriesData = ds.series;
      downsampled = ds.downsampled;
    }

    let datasets;
    if (isPie) {
      const values = seriesData[0]?.values || [];
      datasets = [{
        data: values,
        backgroundColor: labels.map((_, i) => getColor(i)),
        borderWidth: 1,
        borderColor: "#fff",
      }];
    } else {
      datasets = seriesData.map((s, i) => {
        const color = s.color || config?.series?.[i]?.color || getColor(i);
        const fill = chartType === "area" || (config?.fill && chartType === "line");
        return {
          label: s.label || `Series ${i + 1}`,
          data: s.values || [],
          borderColor: color,
          backgroundColor: fill ? color + "33" : color,
          pointRadius: chartType === "scatter" ? 4 : (labels.length > 50 ? 0 : 3),
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: fill ? "origin" : false,
          tension: chartType === "line" || chartType === "area" ? 0.3 : 0,
        };
      });
    }

    const options = {
      responsive: false,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: config?.show_legend !== false && (datasets.length > 1 || isPie),
          position: "top",
          labels: { boxWidth: 12, padding: 8, font: { size: 11 } },
        },
        title: {
          display: !!config?.title,
          text: config?.title + (downsampled ? ` (${original.toLocaleString()} pts)` : "") || "",
          font: { size: 13, weight: "600" },
          padding: { bottom: 8 },
        },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.9)",
          titleFont: { size: 11 },
          bodyFont: { size: 11 },
          padding: 8,
          cornerRadius: 6,
        },
        // Zoom plugin config
        zoom: isZoomable ? {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: "rgba(59,130,246,0.1)", borderColor: "#3b82f6", borderWidth: 1 },
            mode: "x",
            onZoom: ({ chart }) => {
              // On zoom: resample at higher resolution for visible range
              if (!fullDataRef.current) return;
              const { min, max } = chart.scales.x;
              const minIdx = Math.max(0, Math.floor(min));
              const maxIdx = Math.min(fullDataRef.current.labels.length - 1, Math.ceil(max));
              const rangeLen = maxIdx - minIdx + 1;

              if (rangeLen < fullDataRef.current.labels.length * 0.8) {
                // Zoomed in — show more detail for this range
                const slicedLabels = fullDataRef.current.labels.slice(minIdx, maxIdx + 1);
                const slicedSeries = fullDataRef.current.series.map((s) => ({
                  ...s, values: (s.values || []).slice(minIdx, maxIdx + 1),
                }));
                const ds = rangeLen > DOWNSAMPLE_THRESHOLD
                  ? lttbSeries(slicedLabels, slicedSeries, DOWNSAMPLE_THRESHOLD)
                  : { labels: slicedLabels, series: slicedSeries };

                chart.data.labels = ds.labels;
                ds.series.forEach((s, i) => {
                  if (chart.data.datasets[i]) chart.data.datasets[i].data = s.values;
                });
                chart.update("none");
              }
            },
          },
        } : undefined,
      },
    };

    if (!isPie) {
      options.scales = {
        x: {
          display: true,
          stacked: !!config?.stacked,
          title: { display: !!config?.x_label, text: config?.x_label || "", font: { size: 11 } },
          ticks: { font: { size: 10 }, maxRotation: 45, maxTicksLimit: 12 },
          grid: { display: false },
        },
        y: {
          display: true,
          stacked: !!config?.stacked,
          title: { display: !!config?.y_label, text: config?.y_label || "", font: { size: 11 } },
          ticks: { font: { size: 10 } },
          grid: { color: "rgba(0,0,0,0.06)" },
          beginAtZero: config?.begin_at_zero !== false,
        },
      };
    }

    return {
      chartData: { labels, datasets },
      chartOptions: options,
      meta: { downsampled, original, rendered: labels.length },
    };
  }, [data, config, chartType, isPie, isZoomable, downsample]);

  // Create / update chart
  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current || !chartData) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const w = wrapperRef.current.clientWidth;
    const h = wrapperRef.current.clientHeight;
    canvasRef.current.width = w;
    canvasRef.current.height = h;

    const ctx = canvasRef.current.getContext("2d");
    const type = chartType === "area" ? "line" : chartType;

    chartRef.current = new ChartJS(ctx, {
      type,
      data: chartData,
      options: chartOptions,
    });

    const onResize = () => {
      if (!wrapperRef.current || !chartRef.current) return;
      chartRef.current.resize(wrapperRef.current.clientWidth, wrapperRef.current.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
  }, [chartData, chartOptions, chartType]);

  // Reset zoom handler
  const resetZoom = () => {
    if (!chartRef.current || !fullDataRef.current) return;
    chartRef.current.resetZoom();
    // Restore downsampled full dataset
    const ds = fullDataRef.current.labels.length > DOWNSAMPLE_THRESHOLD
      ? lttbSeries(fullDataRef.current.labels, fullDataRef.current.series, DOWNSAMPLE_THRESHOLD)
      : fullDataRef.current;
    chartRef.current.data.labels = ds.labels;
    (ds.series || fullDataRef.current.series).forEach((s, i) => {
      if (chartRef.current.data.datasets[i]) chartRef.current.data.datasets[i].data = s.values;
    });
    chartRef.current.update("none");
  };

  if (!data) return <div style={{ color: "#ccc", fontSize: 13, padding: 12 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 12, padding: 8 }}>{data.error}</div>;
  if (data.message) return <div style={{ color: "#94a3b8", fontSize: 12, padding: 8 }}>{data.message}</div>;

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 120, overflow: "hidden", ...style }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {/* LTTB indicator + zoom reset */}
      {(meta.downsampled || isZoomable) && (
        <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 4, alignItems: "center" }}>
          {meta.downsampled && (
            <span style={{ fontSize: 9, color: "#94a3b8", background: "rgba(255,255,255,0.9)", padding: "1px 6px", borderRadius: 3 }}>
              LTTB {meta.rendered}/{meta.original}
            </span>
          )}
          {isZoomable && (
            <button onClick={resetZoom} title="Reset zoom"
              style={{ fontSize: 9, color: "#64748b", background: "rgba(255,255,255,0.9)", border: "1px solid #e2e8f0", borderRadius: 3, padding: "1px 6px", cursor: "pointer" }}>
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
