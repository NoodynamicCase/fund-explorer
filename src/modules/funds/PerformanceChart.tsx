import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkAreaComponent, MarkLineComponent, GraphicComponent, CanvasRenderer])

interface Props {
  option: object
  label: string
  /** Called (at most once per frame) when the user drags, pans or zooms the chart. */
  onWindow: (from: number, to: number) => void
}

export function PerformanceChart({ option, label, onWindow }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const cb = useRef(onWindow)
  cb.current = onWindow

  useEffect(() => {
    const el = host.current
    if (!el) return
    const c = echarts.init(el, undefined, { renderer: 'canvas' })
    chart.current = c
    let raf = 0
    let pending: [number, number] | null = null
    c.on('datazoom', () => {
      const dz = (c.getOption() as { dataZoom?: { startValue?: number; endValue?: number }[] }).dataZoom?.[0]
      if (!dz || typeof dz.startValue !== 'number' || typeof dz.endValue !== 'number') return
      pending = [dz.startValue, dz.endValue]
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          if (pending) cb.current(pending[0], pending[1])
          pending = null
        })
      }
    })
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option as never, true)
  }, [option])

  return <div ref={host} className="chart-host" role="img" aria-label={label} />
}
