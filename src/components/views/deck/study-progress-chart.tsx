type StudyProgressChartProps = {
  total: number
  visited: number
  completed: number
}

function progressStroke(value: number, total: number, radius: number) {
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? Math.min(value / total, 1) : 0

  return {
    circumference,
    dashOffset: circumference * (1 - progress),
  }
}

export default function StudyProgressChart({
  total,
  visited,
  completed,
}: StudyProgressChartProps) {
  const size = 16
  const outerStroke = 2.5
  const outerRadius = (size - outerStroke) / 2
  // Keep a clear background gap between the center pie and outer ring
  const gap = 2.5
  const innerOuterEdge = outerRadius - outerStroke / 2 - gap
  const innerRadius = innerOuterEdge / 2
  const innerStroke = innerOuterEdge
  const outer = progressStroke(completed, total, outerRadius)
  const inner = progressStroke(visited, total, innerRadius)
  const center = size / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={`${visited.toLocaleString()} of ${total.toLocaleString()} cards visited; ${completed.toLocaleString()} of ${total.toLocaleString()} learned`}
    >
      <circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={innerStroke}
        className="text-muted-foreground/25"
      />
      <circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={innerStroke}
        strokeDasharray={inner.circumference}
        strokeDashoffset={inner.dashOffset}
        className="text-chart-visited"
      />
      <circle
        cx={center}
        cy={center}
        r={outerRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={outerStroke}
        className="text-muted-foreground/25"
      />
      <circle
        cx={center}
        cy={center}
        r={outerRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={outerStroke}
        strokeLinecap="round"
        strokeDasharray={outer.circumference}
        strokeDashoffset={outer.dashOffset}
        className="text-chart-completed"
      />
    </svg>
  )
}
