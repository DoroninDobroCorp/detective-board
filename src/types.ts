// Global types for the Detective Board app

export type NodeType = 'task' | 'group' | 'person';
export type TaskStatus = 'inactive' | 'in_progress' | 'done' | 'active' | 'deferred';

export interface Viewport {
  x: number;
  y: number;
  scale: number; // 1 = 100%
}

export interface BaseNode {
  id: string;
  type: NodeType;
  parentId: string | null; // null = root level
  x: number;
  y: number;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  isActual?: boolean; // default true; when false render at 50% opacity
}

// Recurrence rules for tasks
export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number } // 0 (Sunday) .. 6 (Saturday)
  | { kind: 'monthly'; day: number } // 1..31 (will clamp to end of month)
  | { kind: 'interval'; everyDays: number; anchorDate: string }; // ISO date string (YYYY-MM-DD or full ISO)

export interface TaskNode extends BaseNode {
  type: 'task';
  title: string;
  description?: string;
  iconEmoji?: string; // optional decorative emoji for the task itself
  dueDate?: string; // ISO string
  priority?: 'low' | 'med' | 'high';
  durationMinutes?: number; // optional planned duration
  status: TaskStatus;
  color?: string; // sticky note color
  textSize?: number; // manual override for task text font size
  subtasks?: Subtask[]; // optional subtasks (not rendered on board, only in menus/pages)
  completedAt?: number; // timestamp when task was marked done
  recurrence?: Recurrence; // optional recurrence rule for auto-updating dueDate
}

export interface GroupNode extends BaseNode {
  type: 'group';
  name: string;
  color?: string; // pastel fill color for bubble
  description?: string;
  titleSize?: number; // manual override for group title font size
}

export type PersonRole = 'employee' | 'partner' | 'bot';

export interface PersonNode extends BaseNode {
  type: 'person';
  role: PersonRole;
  name: string;
  avatarEmoji?: string; // avatar rendered as emoji for simplicity
  color?: string; // color of avatar background
  avatarUrl?: string; // optional photo
  contacts?: {
    email?: string;
    phone?: string;
    notes?: string;
  };
}

export type AnyNode = TaskNode | GroupNode | PersonNode;

export interface Subtask {
  id: string;
  title: string;
  done?: boolean;
  createdAt?: number;
}

export interface LinkThread {
  id: string;
  fromId: string;
  toId: string;
  color?: string; // default red thread
  dir?: 'one' | 'both'; // directionality of the arrow
}

export interface User {
  id: string;
  name: string;
  emoji?: string;
}

export interface BookItem {
  id: string;
  title: string;
  comment?: string;
  coverUrl?: string;
  createdAt: number;
  status?: 'active' | 'done';
  completedAt?: number;
}

export interface MovieItem {
  id: string;
  title: string;
  comment?: string;
  coverUrl?: string;
  createdAt: number;
  status?: 'active' | 'done';
  completedAt?: number;
}

export interface GameItem {
  id: string;
  title: string;
  comment?: string;
  coverUrl?: string;
  createdAt: number;
  status?: 'active' | 'done';
  completedAt?: number;
}

export interface PurchaseItem {
  id: string;
  title: string;
  comment?: string;
  coverUrl?: string;
  createdAt: number;
  status?: 'active' | 'done';
  completedAt?: number;
}

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD format
  content: string;
  mood?: '😊' | '😐' | '😔' | '😡' | '😴' | '🎉' | '💭' | '✨';
  createdAt: number;
  updatedAt: number;
}

export type Tool =
  | 'none'
  | 'link'
  | 'add-task'
  | 'add-group'
  | 'add-person-employee'
  | 'add-person-partner'
  | 'add-person-bot';
