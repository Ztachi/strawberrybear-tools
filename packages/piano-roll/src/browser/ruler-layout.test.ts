import { describe, expect, it } from 'vitest'
import { createTimeline } from '../core'
import { rulerLabels } from './ruler-layout'

const timeline = createTimeline({
  durationTicks: 960000,
  ticksPerBeat: 480,
  tempoMap: [
    { tick: 0, microsecondsPerQuarter: 500001 },
    { tick: 19200, microsecondsPerQuarter: 750003 },
  ],
  timeSignatureMap: [
    { tick: 0, numerator: 4, denominator: 4 },
    { tick: 24001, numerator: 3, denominator: 8 },
  ],
  tracks: [],
  notes: [],
})
const measure = (text: string) => text.length * 7.13

describe('ruler label layout', () => {
  it.each([4, 12, 23.999, 24, 24.001, 70.63, 95.999, 96, 96.001, 1200])(
    'keeps label identity and spacing while panning across edges at %s px/s',
    (zoom) => {
      const width = 600
      const start = 8 * zoom
      const baseline = rulerLabels(timeline, zoom, start, width, measure)
      expect(baseline.length).toBeGreaterThan(0)
      for (let offset = 0; offset < 80; offset += 0.37) {
        const left = start + offset
        const labels = rulerLabels(timeline, zoom, left, width, measure)
        const overlap = (x: number) => x >= left && x <= start + width - 60
        expect(labels.filter((mark) => overlap(mark.x))).toEqual(
          baseline.filter((mark) => overlap(mark.x))
        )
        for (let index = 1; index < labels.length; index += 1) {
          const previous = labels[index - 1]!
          expect(labels[index]!.x - previous.x - measure(previous.label)).toBeGreaterThanOrEqual(6)
        }
      }
    }
  )

  it('keeps a label partially visible after its tick has left the viewport', () => {
    const labels = rulerLabels(timeline, 32, 7, 600, measure)
    expect(labels.find((mark) => mark.tick === 0)?.label).toBe('1')
  })
})
