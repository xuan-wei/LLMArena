export function getScoreColors(score: number | null) {
  if (score === null) return { border: "border-l-gray-300", badge: "bg-gray-100 text-gray-700", icon: "○" };

  const normalized = Math.min(1, Math.max(0, score));
  if (normalized === 1.0) {
    return { border: "border-l-green-500", badge: "bg-green-100 text-green-700", icon: "✓" };
  } else if (normalized >= 0.7) {
    return { border: "border-l-yellow-400", badge: "bg-yellow-100 text-yellow-700", icon: "◐" };
  } else if (normalized >= 0.5) {
    return { border: "border-l-orange-500", badge: "bg-orange-100 text-orange-700", icon: "◑" };
  } else {
    return { border: "border-l-red-500", badge: "bg-red-100 text-red-700", icon: "✗" };
  }
}
