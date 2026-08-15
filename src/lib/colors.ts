export const TOPIC_COLORS = [
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#14b8a6",
  "#84cc16",
];

export function nextTopicColor(usedCount: number): string {
  return TOPIC_COLORS[usedCount % TOPIC_COLORS.length];
}
