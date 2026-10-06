import '@tanstack/react-start/server-only'

import {
  getResponseHeader,
  setResponseHeader,
} from '@tanstack/react-start/server'

type StudyTimingMetric = {
  name: string
  durationMs: number
  description?: string
}

export function elapsedMs(startedAt: number) {
  return performance.now() - startedAt
}

export function publishStudyTiming(
  operation: string,
  metrics: StudyTimingMetric[],
  details: Record<string, unknown>,
) {
  if (process.env.NODE_ENV === 'test') return

  const roundedMetrics = metrics.map((metric) => ({
    ...metric,
    durationMs: roundDuration(metric.durationMs),
  }))
  const serverTiming = roundedMetrics
    .map(({ name, durationMs, description }) =>
      [
        name,
        `dur=${durationMs}`,
        description ? `desc="${sanitizeDescription(description)}"` : undefined,
      ]
        .filter(Boolean)
        .join(';'),
    )
    .join(', ')

  try {
    const existingServerTiming = getResponseHeader('Server-Timing')
    setResponseHeader(
      'Server-Timing',
      existingServerTiming
        ? `${existingServerTiming}, ${serverTiming}`
        : serverTiming,
    )
  } catch {
    // Direct server-function tests do not install an HTTP response context.
  }

  console.info('[study-timing]', {
    operation,
    metrics: Object.fromEntries(
      roundedMetrics.map(({ name, durationMs }) => [name, durationMs]),
    ),
    ...details,
  })
}

function roundDuration(durationMs: number) {
  return Math.round(durationMs * 10) / 10
}

function sanitizeDescription(description: string) {
  return description.replaceAll(/["\\]/g, '')
}
