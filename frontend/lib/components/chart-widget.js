"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Filler, Legend, Tooltip, Title,
  LineController, BarController, PieController, DoughnutController, ScatterController,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";

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
export function getColor(index) { return PALETTE[index % PALETTE.length]; }
export { PALETTE };

// ─── Chart wrapper — server-side LTTB + dynamic zoom fetch ───────────────────
//
// Flow:
// 1. Parent loads initial data from API (already LTTB downsampled server-side)
// 2. Chart renders 300 points (smooth)
// 3. User zooms → chart calls onZoomFetch(start_idx, end_idx)
// 4. Parent re-fetches from API with zoom_range → server returns higher-res LTTB for that range
// 5. Chart updates with new data
// 6. Reset → back to initial overview
//
// If no onZoomFetch provided (standalone use), zoom/pan still works on client data.

export default function ChartWidget({ config, data, style, widgetConfig, onZoomFetch }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const wrapperRef = useRef(null);
  const zoomTimerRef = useRef(null);

  const chartType = config?.chart_type || "line";
  const isPie = chartType === "pie" || chartType === "doughnut";
  const isZoomable = !isPie && (chartType === "line" || chartType === "area" || chartType === "scatter");

  const meta = data?._meta || {};
  const totalRows = meta.total_rows || data?.labels?.length || 0;
  const rendered = meta.rendered || data?.labels?.length || 0;
  const downsampled = meta.downsampled || false;

  // Build Chart.js data + options
  const { chartData, chartOptions } = useMemo(() => {
    if (!data) return { chartData: null, chartOptions: {} };

    const labels = data.labels || [];
    let seriesData = data.series ? [...data.series] : [];
    if (seriesData.length === 0 && data.values) {
      seriesData.push({ label: config?.y_label || "Value", values: data.values });
    }

    let datasets;
    if (isPie) {
      const values = seriesData[0]?.values || [];
      datasets = [{
        data: values,
        backgroundColor: labels.map((_, i) => getColor(i)),
        borderWidth: 1, borderColor: "#fff",
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
          pointRadius: chartType === "scatter" ? 4 : (labels.length > 80 ? 0 : 2),
          pointHoverRadius: 4,
          borderWidth: 1.5,
          fill: fill ? "origin" : false,
          tension: chartType === "line" || chartType === "area" ? 0.2 : 0,
        };
      });
    }

    const titleText = config?.title || "";
    const titleSuffix = downsampled ? ` (${totalRows.toLocaleString()} pts)` : "";

    const options = {
      responsive: false,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: config?.show_legend !== false && (datasets.length > 1 || isPie),
          position: "top",
          labels: { boxWidth: 12, padding: 8, font: { size: 11 } },
        },
        title: {
          display: !!titleText,
          text: titleText + titleSuffix,
          font: { size: 13, weight: "600" },
          padding: { bottom: 8 },
        },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.9)",
          titleFont: { size: 11 }, bodyFont: { size: 11 },
          padding: 8, cornerRadius: 6,
        },
        zoom: isZoomable ? {
          pan: { enabled: true, mode: "x" },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: "rgba(59,130,246,0.08)", borderColor: "#3b82f6", borderWidth: 1 },
            mode: "x",
            onZoomComplete: ({ chart }) => {
              // Debounced zoom fetch — wait 300ms after zoom stops
              if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
              zoomTimerRef.current = setTimeout(() => {
                const { min, max } = chart.scales.x;
                const startIdx = Math.max(0, Math.floor(min));
                const endIdx = Math.min(totalRows - 1, Math.ceil(max));
                // Map rendered indices back to original data indices
                const ratio = totalRows / rendered;
                const origStart = Math.floor(startIdx * ratio);
                const origEnd = Math.ceil(endIdx * ratio);
                if (onZoomFetch && totalRows > rendered) {
                  onZoomFetch(origStart, origEnd);
                }
              }, 300);
            },
          },
        } : undefined,
      },
    };

    if (!isPie) {
      options.scales = {
        x: {
          display: true, stacked: !!config?.stacked,
          title: { display: !!config?.x_label, text: config?.x_label || "", font: { size: 11 } },
          ticks: { font: { size: 10 }, maxRotation: 45, maxTicksLimit: 12 },
          grid: { display: false },
        },
        y: {
          display: true, stacked: !!config?.stacked,
          title: { display: !!config?.y_label, text: config?.y_label || "", font: { size: 11 } },
          ticks: { font: { size: 10 } },
          grid: { color: "rgba(0,0,0,0.06)" },
          beginAtZero: config?.begin_at_zero !== false,
        },
      };
    }

    return { chartData: { labels, datasets }, chartOptions: options };
  }, [data, config, chartType, isPie, isZoomable, totalRows, rendered, downsampled, onZoomFetch]);

  // Create / update chart
  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current || !chartData) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const w = wrapperRef.current.clientWidth;
    const h = wrapperRef.current.clientHeight;
    canvasRef.current.width = w;
    canvasRef.current.height = h;

    const ctx = canvasRef.current.getContext("2d");
    chartRef.current = new ChartJS(ctx, {
      type: chartType === "area" ? "line" : chartType,
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

  // Reset zoom → re-fetch overview
  const resetZoom = () => {
    if (chartRef.current) chartRef.current.resetZoom();
    if (onZoomFetch) onZoomFetch(null, null); // null = reset to overview
  };

  if (!data) return <div style={{ color: "#ccc", fontSize: 13, padding: 12 }}>Loading...</div>;
  if (data.error) return <div style={{ color: "#e53e3e", fontSize: 12, padding: 8 }}>{data.error}</div>;
  if (data.message) return <div style={{ color: "#94a3b8", fontSize: 12, padding: 8 }}>{data.message}</div>;

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 120, overflow: "hidden", ...style }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {(downsampled || isZoomable) && (
        <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 4, alignItems: "center" }}>
          {downsampled && (
            <span style={{ fontSize: 9, color: "#94a3b8", background: "rgba(255,255,255,0.9)", padding: "1px 6px", borderRadius: 3 }}>
              LTTB {rendered}/{totalRows.toLocaleString()}
            </span>
          )}
          {isZoomable && (
            <button onClick={resetZoom} title="Reset zoom (double-click also works)"
              style={{ fontSize: 9, color: "#64748b", background: "rgba(255,255,255,0.9)", border: "1px solid #e2e8f0", borderRadius: 3, padding: "1px 6px", cursor: "pointer" }}>
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
