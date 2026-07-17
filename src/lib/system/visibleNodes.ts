// Which nodes are "in view" for a given focus — the orrery's naming/visibility rule, shared so the
// 2D view and the 3D holo view name bodies identically: you always see the focused body, its
// ancestors and its siblings; a body's children (e.g. moons) surface only when it is the focus.
// Extracted verbatim from SystemVisualizer so the two can't drift.
import type { System, SystemNode } from '$lib/types';

export function getVisibleNodeIds(system: System | null, focusedBodyId: string | null): Set<string> {
  const visibleIds = new Set<string>();
  if (!system) return visibleIds;
  const nodesById = new Map(system.nodes.map((n) => [n.id, n]));
  const primaryStar = system.nodes.find((n) => n.parentId === null);
  let focusNode = nodesById.get(focusedBodyId || '');
  if (!focusNode) focusNode = primaryStar;
  if (!focusNode) return visibleIds;
  let current: SystemNode | undefined = focusNode;
  while (current) {
    visibleIds.add(current.id);
    current = current.parentId ? nodesById.get(current.parentId) : undefined;
  }
  const focusNodeHasChildren = system.nodes.some((n) => n.parentId === focusNode!.id);
  let contextBody = focusNode;
  if (!focusNodeHasChildren) contextBody = focusNode.parentId ? nodesById.get(focusNode.parentId) ?? focusNode : focusNode;
  visibleIds.add(contextBody.id);
  system.nodes.forEach((n) => { if (n.parentId === contextBody.id) visibleIds.add(n.id); });
  if (contextBody.parentId) {
    const grandparentId = contextBody.parentId;
    system.nodes.forEach((n) => { if (n.parentId === grandparentId) visibleIds.add(n.id); });
  }
  // Barycentres are TRANSPARENT containers: whenever a barycentre is visible, its member bodies are
  // too (else binary planets/stars under it would vanish). Iterate to handle nesting.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const n of system.nodes) {
      if (n.kind === 'barycenter' && visibleIds.has(n.id) && Array.isArray((n as any).memberIds)) {
        for (const m of (n as any).memberIds) if (!visibleIds.has(m)) { visibleIds.add(m); expanded = true; }
      }
    }
  }
  // Free-floating constructs (transit/drift) are positioned absolutely, outside the focus chain —
  // always keep them nameable/selectable.
  for (const n of system.nodes) {
    if (n.kind === 'construct' && (n as any).vector_position_au) visibleIds.add(n.id);
  }
  return visibleIds;
}
