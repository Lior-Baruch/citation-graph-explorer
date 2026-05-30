// Distinct, readable cluster colors on a dark background.
export const CLUSTER_PALETTE = [
  "#60a5fa", // blue
  "#f472b6", // pink
  "#34d399", // green
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#f87171", // red
  "#22d3ee", // cyan
  "#fb923c", // orange
];

export const UNCLUSTERED = "#94a3b8"; // slate

export function clusterColor(clusterId) {
  if (clusterId === undefined || clusterId === null) return UNCLUSTERED;
  return CLUSTER_PALETTE[clusterId % CLUSTER_PALETTE.length];
}
