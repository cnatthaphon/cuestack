"use client";

import { useRef, useEffect, useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Filler, Legend, Tooltip, Title,
  LineController, BarController, PieController, DoughnutController, ScatterController,
} from "chart.js";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Filler, Legend, Tooltip, Title,
  LineController, BarController, PieController, DoughnutController, ScatterController,
);

// ─── Default palette — 12 colors that work on white backgrounds ──────────────
const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899",
  "#06b6d4", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#e11d48",
];

export function getColor(index) {
  return PALETTE[index % PALETTE.length];
}

export { PALETTE };

// ─── Chart wrapper ───────────────────────────────────────────────────────────
// config: { chart_type, series[], labels[], title, x_label, y_label, stacked, show_legend, fill }
export default function ChartWidget({ config, data, style }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const chartType = config?.chart_type || "line";
  const isPie = chartType === "pie" || chartType === "doughnut";

  // Build Chart.js data + options from our config
  const { chartData, chartOptions } = useMemo(() => {
    if (!data) return { chartData: null, chartOptions: {} };

    const labels = data.labels || [];

    let datasets;
    if (isPie) {
      // Pie/doughnut: single dataset, colors per slice
      const values = data.series?.[0]?.values || data.values || [];
      datasets = [{
        data: values,
        backgroundColor: labels.map((_, i) => getColor(i)),
        borderWidth: 1,
        borderColor: "#fff",
      }];
    } else {
      // Line/bar/area/scatter: one dataset per series
      const seriesData = data.series || [];
      if (seriesData.length === 0 && data.values) {
        // Legacy single-series fallback
        seriesData.push({ label: config?.y_label || "Value", values: data.values });
      }
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
      responsive: false, // we manage sizing ourselves to avoid resize loops
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: config?.show_legend !== false && (datasets.length > 1 || isPie),
          position: "top",
          labels: { boxWidth: 12, padding: 8, font: { size: 11 } },
        },
        title: {
          display: !!config?.title,
          text: config?.title || "",
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
    };
  }, [data, config, chartType, isPie]);

  const wrapperRef = useRef(null);

  // Size canvas to wrapper, then create/update chart
  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current || !chartData) return;

    // Destroy old chart first
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    // Size canvas to wrapper (avoids resize loop)
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

    // Resize on window resize
    const onResize = () => {
      if (!wrapperRef.current || !chartRef.current) return;
      const nw = wrapperRef.current.clientWidth;
      const nh = wrapperRef.current.clientHeight;
      chartRef.current.resize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartData, chartOptions, chartType]);

  if (!data) {
    return <div style={{ color: "#ccc", fontSize: 13, padding: 12 }}>Loading...</div>;
  }

  if (data.error) {
    return <div style={{ color: "#e53e3e", fontSize: 12, padding: 8 }}>{data.error}</div>;
  }

  if (data.message) {
    return <div style={{ color: "#94a3b8", fontSize: 12, padding: 8 }}>{data.message}</div>;
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 120, overflow: "hidden", ...style }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}
