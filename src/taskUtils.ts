import type { AnyNode, GroupNode, TaskNode } from './types';

export interface TaskPathInfo {
  id: string;
  title: string;
  status: TaskNode['status'];
  dueDate?: string;
  isActual?: boolean;
  description?: string;
  priority?: TaskNode['priority'];
  parentPath: string[];
  iconEmoji?: string;
}

export function isTaskNode(node: AnyNode): node is TaskNode {
  return node.type === 'task';
}

export function isGroupNode(node: AnyNode | undefined | null): node is GroupNode {
  return !!node && node.type === 'group';
}

export function buildNodeMap(nodes: AnyNode[]): Map<string, AnyNode> {
  const map = new Map<string, AnyNode>();
  for (const node of nodes) {
    map.set(node.id, node);
  }
  return map;
}

export function computeTaskPath(task: TaskNode, map: Map<string, AnyNode>): string[] {
  const path: string[] = [];
  let parentId: string | null | undefined = task.parentId;
  const guard = new Set<string>();
  while (parentId) {
    if (guard.has(parentId)) break;
    guard.add(parentId);
    const parent = map.get(parentId);
    if (!parent) break;
    if (parent.type === 'group') {
      const name = parent.name?.trim();
      if (name) path.push(name);
      parentId = parent.parentId;
      continue;
    }
    parentId = parent.parentId;
  }
  return path.reverse();
}

export function summarizeTask(task: TaskNode, map: Map<string, AnyNode>): TaskPathInfo {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate,
    isActual: task.isActual,
    description: task.description,
    priority: task.priority,
    parentPath: computeTaskPath(task, map),
    iconEmoji: task.iconEmoji,
  };
}

export function formatTaskLine(info: TaskPathInfo): string {
  const pathLabel = info.parentPath.length ? `${info.parentPath.join(' > ')} → ` : '';
  const dueLabel = info.dueDate ? new Date(info.dueDate).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : 'без срока';
  const priorityLabel = info.priority ? `, приоритет: ${info.priority}` : '';
  const icon = info.iconEmoji ? `${info.iconEmoji} ` : '';
  const statusLabel = info.status === 'active' || info.status === 'in_progress' ? '' : ` [${info.status}]`;
  const desc = info.description ? ` — ${trimDescription(info.description)}` : '';
  return `${icon}${pathLabel}${info.title}${statusLabel} (срок: ${dueLabel}${priorityLabel})${desc}`;
}

function trimDescription(desc: string): string {
  const clean = desc.replace(/\s+/g, ' ').trim();
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157)}…`;
}

