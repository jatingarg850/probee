import type { FlowEdge, FlowNode, FlowNodeType } from '@/types/resume'

export interface LayoutNode extends FlowNode {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdge extends FlowEdge {
  path: string
}

export interface FlowLayout {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

export const NODE_WIDTH = 190
export const NODE_HEIGHT = 68
const COLUMN_GAP = 110
const ROW_GAP = 28
const MARGIN = 40

/** Fixed left-to-right reading order — this is what makes the chart read as
 * "resume in, reasoning across, roles out" instead of a scattered graph. */
const COLUMN_BY_TYPE: Record<FlowNodeType, number> = {
  input: 0,
  skill: 1,
  experience: 1,
  decision: 2,
  role: 3,
}

/** Places nodes into left-to-right columns by type and stacks each column
 * vertically, then routes a cubic-bezier edge between the right edge of
 * each source node and the left edge of each target node. Deliberately
 * simple (no cross-minimization) — with 6-10 nodes and a fixed 4-column
 * shape, a naive layout is already legible, and simplicity keeps this
 * fully deterministic for a graph coming from an LLM response. */
export function layoutFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowLayout {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const safeEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))

  const columns = new Map<number, FlowNode[]>()
  for (const node of nodes) {
    const col = COLUMN_BY_TYPE[node.type] ?? 1
    const list = columns.get(col) ?? []
    list.push(node)
    columns.set(col, list)
  }

  const columnCount = Math.max(...Array.from(columns.keys()), 0) + 1
  const maxRows = Math.max(...Array.from(columns.values()).map((l) => l.length), 1)
  const contentHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP

  const positioned = new Map<string, LayoutNode>()
  for (let col = 0; col < columnCount; col++) {
    const list = columns.get(col) ?? []
    const colHeight = list.length * NODE_HEIGHT + (list.length - 1) * ROW_GAP
    const startY = MARGIN + (contentHeight - colHeight) / 2
    list.forEach((node, row) => {
      positioned.set(node.id, {
        ...node,
        x: MARGIN + col * (NODE_WIDTH + COLUMN_GAP),
        y: startY + row * (NODE_HEIGHT + ROW_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })
    })
  }

  const layoutEdges: LayoutEdge[] = safeEdges.map((edge) => {
    const from = positioned.get(edge.from)
    const to = positioned.get(edge.to)
    if (!from || !to) return { ...edge, path: '' }

    const sx = from.x + from.width
    const sy = from.y + from.height / 2
    const tx = to.x
    const ty = to.y + to.height / 2
    const dx = Math.max(40, (tx - sx) / 2)

    return {
      ...edge,
      path: `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`,
    }
  })

  const width = MARGIN * 2 + columnCount * NODE_WIDTH + (columnCount - 1) * COLUMN_GAP
  const height = MARGIN * 2 + contentHeight

  return {
    nodes: Array.from(positioned.values()),
    edges: layoutEdges,
    width,
    height,
  }
}
