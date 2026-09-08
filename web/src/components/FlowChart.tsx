'use client'

import { Maximize2 } from '@/components/ui/icons'
import { useEffect, useMemo, useRef, useState } from 'react'

import { layoutFlow } from '@/lib/flowLayout'
import type { FlowEdge, FlowNode, FlowNodeType } from '@/types/resume'

/** Node colours are the 600/700-weight shades of each hue: the diagram
 * renders on the bone card surface, where the old 400-weight neons read as
 * washed-out pastel and the badge text became unreadable. `fill` is the
 * node's own tinted ground so each type is distinguishable at a glance
 * without relying on the 1.5px border alone. */
const TYPE_STYLE: Record<FlowNodeType, { border: string; glow: string; badge: string; fill: string; label: string }> = {
  input: { border: '#1d4ed8', glow: 'rgba(29,78,216,0.28)', badge: '#1d4ed8', fill: '#eef2ff', label: 'Resume' },
  skill: { border: '#047857', glow: 'rgba(4,120,87,0.24)', badge: '#047857', fill: '#ecfdf5', label: 'Skill' },
  experience: {
    border: '#b45309',
    glow: 'rgba(180,83,9,0.24)',
    badge: '#b45309',
    fill: '#fffbeb',
    label: 'Experience',
  },
  decision: { border: '#be185d', glow: 'rgba(190,24,93,0.26)', badge: '#be185d', fill: '#fdf2f8', label: 'Fit check' },
  role: { border: '#c2410c', glow: 'rgba(194,65,12,0.28)', badge: '#c2410c', fill: '#fff7ed', label: 'Role' },
}

const MIN_SCALE = 0.5
const MAX_SCALE = 2.2

interface FlowChartProps {
  nodes: FlowNode[]
  edges: FlowEdge[]
  className?: string
}

/** Interactive reasoning diagram: resume -> extracted skills/experience ->
 * fit decision -> recommended role(s). Click a box to read its detail;
 * drag to pan; scroll/pinch to zoom. Hand-rolled SVG (no charting/diagram
 * library) to match the rest of this project's chart components. */
export function FlowChart({ nodes, edges, className }: FlowChartProps) {
  const layout = useMemo(() => layoutFlow(nodes, edges), [nodes, edges])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const selected = layout.nodes.find((n) => n.id === selectedId) ?? null

  const touchedBySelection = useMemo(() => {
    if (!selectedId) return null
    const ids = new Set<string>([selectedId])
    for (const e of layout.edges) {
      if (e.from === selectedId) ids.add(e.to)
      if (e.to === selectedId) ids.add(e.from)
    }
    return ids
  }, [selectedId, layout.edges])

  const resetView = () => {
    setView({ x: 0, y: 0, scale: 1 })
    setSelectedId(null)
  }

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, viewX: view.x, viewY: view.y }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setView((v) => ({ ...v, x: dragRef.current!.viewX + dx, y: dragRef.current!.viewY + dy }))
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  // React attaches its synthetic onWheel as a passive listener, so
  // preventDefault() inside it is a silent no-op (and logs a console
  // warning) — it can't stop the page from scrolling while the pointer is
  // over the chart. A real, non-passive native listener is required to
  // actually take over the wheel gesture for zoom.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = -e.deltaY * 0.001
      setView((v) => ({ ...v, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale + delta * v.scale)) }))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const viewBoxW = layout.width
  const viewBoxH = layout.height

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-border bg-surface/70"
        style={{ height: 380, touchAction: 'none' }}
      >
        <button
          type="button"
          onClick={resetView}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Maximize2 className="h-3 w-3" />
          Reset view
        </button>

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="cursor-grab active:cursor-grabbing"
          role="img"
          aria-label="Resume analysis reasoning flow chart"
        >
          <defs>
            {Object.entries(TYPE_STYLE).map(([type, style]) => (
              <marker
                key={type}
                id={`flow-arrow-${type}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={style.border} />
              </marker>
            ))}
          </defs>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {layout.edges.map((edge, i) => {
              const targetNode = layout.nodes.find((n) => n.id === edge.to)
              const arrowType = targetNode?.type ?? 'skill'
              const dimmed = touchedBySelection
                ? !(touchedBySelection.has(edge.from) && touchedBySelection.has(edge.to))
                : false
              return (
                <g key={`${edge.from}-${edge.to}-${i}`} opacity={dimmed ? 0.15 : 1}>
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={TYPE_STYLE[arrowType].border}
                    strokeWidth={dimmed ? 1.25 : 1.75}
                    markerEnd={`url(#flow-arrow-${arrowType})`}
                  />
                  {edge.label ? (
                    <text
                      x={0}
                      y={0}
                      className="fill-muted-foreground"
                      fontSize="9"
                      textAnchor="middle"
                      transform={(() => {
                        const from = layout.nodes.find((n) => n.id === edge.from)
                        const to = layout.nodes.find((n) => n.id === edge.to)
                        if (!from || !to) return undefined
                        const mx = (from.x + from.width + to.x) / 2
                        const my = (from.y + from.height / 2 + to.y + to.height / 2) / 2 - 6
                        return `translate(${mx} ${my})`
                      })()}
                    >
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              )
            })}

            {layout.nodes.map((node) => {
              const style = TYPE_STYLE[node.type]
              const isSelected = node.id === selectedId
              const dimmed = touchedBySelection ? !touchedBySelection.has(node.id) : false
              const toggleSelected = () => setSelectedId((cur) => (cur === node.id ? null : node.id))
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  onClick={toggleSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSelected()
                    }
                  }}
                  // biome-ignore lint/a11y/useSemanticElements: SVG has no native interactive-group element; role="button" on a positioned <g> is the standard accessible pattern for a clickable SVG node.
                  role="button"
                  tabIndex={0}
                  aria-label={`${style.label}: ${node.label}`}
                  className="cursor-pointer outline-none"
                  opacity={dimmed ? 0.35 : 1}
                >
                  <rect
                    width={node.width}
                    height={node.height}
                    rx={10}
                    fill={style.fill}
                    stroke={style.border}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    style={isSelected ? { filter: `drop-shadow(0 0 8px ${style.glow})` } : undefined}
                  />
                  <text x={10} y={18} fontSize="8.5" letterSpacing="0.05em" fill={style.badge} className="uppercase">
                    {style.label}
                  </text>
                  <foreignObject x={8} y={22} width={node.width - 16} height={node.height - 28}>
                    <div className="flex h-full items-start text-[12px] font-medium leading-snug text-foreground">
                      {node.label}
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {selected ? (
        <div className="mt-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: TYPE_STYLE[selected.type].border }} />
            <span className="text-sm font-medium text-foreground">{selected.label}</span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{selected.detail}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Click any box for detail · drag to pan · scroll to zoom</p>
      )}
    </div>
  )
}
