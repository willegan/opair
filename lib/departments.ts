import { Department, DepartmentNode } from '@/lib/types/department'

/**
 * Build a nested department tree from a flat list of departments.
 * Returns the top-level nodes (parent_id === null) with children recursively attached.
 */
export function buildDepartmentTree(departments: Department[]): DepartmentNode[] {
  const map = new Map<string, DepartmentNode>()

  // Initialise all nodes with empty children arrays
  for (const dept of departments) {
    map.set(dept.id, { ...dept, children: [] })
  }

  const roots: DepartmentNode[] = []

  for (const dept of departments) {
    const node = map.get(dept.id)!
    if (node.parent_id === null) {
      roots.push(node)
    } else {
      const parent = map.get(node.parent_id)
      if (parent) {
        parent.children.push(node)
      } else {
        // Orphaned node (parent deleted) — treat as root
        roots.push(node)
      }
    }
  }

  return roots
}

/**
 * Get the flat list of all descendant IDs for a given department ID,
 * including the department itself.
 *
 * @param departments - Flat list of all departments
 * @param rootId - The department ID to start from
 * @returns Array of IDs (rootId + all descendants)
 */
export function getDescendantIds(departments: Department[], rootId: string): string[] {
  const result: string[] = []
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    const children = departments.filter((d) => d.parent_id === current)
    for (const child of children) {
      queue.push(child.id)
    }
  }

  return result
}
