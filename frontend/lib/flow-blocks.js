// Visual Flow Block definitions — same pattern as backend Simulink-style blocks
// Each block: type, label, icon, inputs, outputs, configFields

export const BLOCK_CATALOG = [
  {
    type: "data_source",
    label: "Data Source",
    icon: "\u{1F4BE}",
    category: "input",
    description: "Load data from an org table",
    configFields: [
      { key: "table", label: "Table", type: "table_select" },
      { key: "limit", label: "Max Rows", type: "number", default: 100 },
      { key: "order_by", label: "Order By", type: "column_select" },
      { key: "order_dir", label: "Direction", type: "select", options: ["DESC", "ASC"] },
    ],
    inputs: [],
    outputs: ["data"],
  },
  {
    type: "filter",
    label: "Filter",
    icon: "\u{1F50D}",
    category: "transform",
    description: "Filter rows by condition",
    configFields: [
      { key: "column", label: "Column", type: "column_select" },
      { key: "operator", label: "Operator", type: "select", options: ["==", "!=", ">", "<", ">=", "<=", "contains"] },
      { key: "value", label: "Value", type: "text" },
    ],
    inputs: ["data"],
    outputs: ["data"],
  },
  {
    type: "transform",
    label: "Transform",
    icon: "\u{1F504}",
    category: "transform",
    description: "Transform column values",
    configFields: [
      { key: "column", label: "Column", type: "column_select" },
      { key: "operation", label: "Operation", type: "select", options: ["round", "abs", "uppercase", "lowercase", "multiply", "add"] },
      { key: "param", label: "Parameter", type: "text" },
    ],
    inputs: ["data"],
    outputs: ["data"],
  },
  {
    type: "aggregate",
    label: "Aggregate",
    icon: "\u{1F4CA}",
    category: "transform",
    description: "Group and aggregate data",
    configFields: [
      { key: "group_by", label: "Group By", type: "column_select" },
      { key: "agg_column", label: "Aggregate Column", type: "column_select" },
      { key: "agg_func", label: "Function", type: "select", options: ["count", "sum", "avg", "min", "max"] },
    ],
    inputs: ["data"],
    outputs: ["data"],
  },
  {
    type: "chart",
    label: "Chart Output",
    icon: "\u{1F4C8}",
    category: "output",
    description: "Render data as a chart",
    configFields: [
      { key: "chart_type", label: "Chart Type", type: "select", options: ["bar", "line", "pie"] },
      { key: "x_column", label: "X Axis", type: "column_select" },
      { key: "y_column", label: "Y Axis", type: "column_select" },
      { key: "title", label: "Title", type: "text" },
    ],
    inputs: ["data"],
    outputs: [],
  },
  {
    type: "table_output",
    label: "Table Output",
    icon: "\u{1F4CB}",
    category: "output",
    description: "Display data as a table",
    configFields: [
      { key: "title", label: "Title", type: "text" },
      { key: "max_rows", label: "Max Rows", type: "number", default: 20 },
    ],
    inputs: ["data"],
    outputs: [],
  },
  {
    type: "stat_output",
    label: "Stat Output",
    icon: "\u{1F522}",
    category: "output",
    description: "Show a single aggregated value",
    configFields: [
      { key: "column", label: "Column", type: "column_select" },
      { key: "agg_func", label: "Function", type: "select", options: ["count", "sum", "avg", "min", "max"] },
      { key: "label", label: "Label", type: "text" },
    ],
    inputs: ["data"],
    outputs: [],
  },
  {
    type: "api_call",
    label: "API Call",
    icon: "\u{1F310}",
    category: "input",
    description: "Fetch data from an API endpoint",
    configFields: [
      { key: "url", label: "URL", type: "text" },
      { key: "method", label: "Method", type: "select", options: ["GET", "POST"] },
      { key: "data_path", label: "Data Path (e.g. data.items)", type: "text" },
    ],
    inputs: [],
    outputs: ["data"],
  },
];

export function getBlock(type) {
  return BLOCK_CATALOG.find((b) => b.type === type);
}
