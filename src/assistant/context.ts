import { useAppStore } from '../store';
import type { AssistantMessage } from './storage';
import { loadPrompt, loadSavedInfo } from './storage';
import { buildNodeMap, formatTaskLine, isTaskNode, summarizeTask, type TaskPathInfo } from '../taskUtils';
import type { AnyNode, TaskNode } from '../types';
import { db } from '../db';

export interface AssistantContextData {
  generatedAt: string;
  savedInfo: string;
  prompt: string;
  activeTasks: TaskPathInfo[];
  history: AssistantMessage[];
  contextText: string;
}

function pickActiveTasks(nodes: AnyNode[]): TaskNode[] {
  return nodes.filter((n): n is TaskNode => (
    isTaskNode(n) &&
    (n.status === 'active' || n.status === 'in_progress' || n.status === 'deferred') &&
    n.isActual !== false
  ));
}

function sortTasks(tasks: TaskNode[]): TaskNode[] {
  return tasks.slice().sort((a, b) => {
    const aDue = a.dueDate ? a.dueDate.slice(0, 16) : '9999-12-31T23:59';
    const bDue = b.dueDate ? b.dueDate.slice(0, 16) : '9999-12-31T23:59';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    const aPr = priorityWeight(a.priority);
    const bPr = priorityWeight(b.priority);
    if (aPr !== bPr) return aPr - bPr;
    return a.title.localeCompare(b.title);
  });
}

function priorityWeight(priority?: TaskNode['priority']): number {
  if (priority === 'high') return 0;
  if (priority === 'med') return 1;
  if (priority === 'low') return 2;
  return 3;
}

function formatHistory(history: AssistantMessage[]): string {
  return history
    .slice()
    .reverse()
    .map((msg) => {
      const when = new Date(msg.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const author = msg.role === 'assistant' ? 'Ассистент' : msg.role === 'system' ? 'Система' : 'Пользователь';
      return `${when} — ${author}: ${msg.text}`;
    })
    .join('\n');
}

export async function buildAssistantContext(options: {
  savedInfo?: string;
  prompt?: string;
  messages?: AssistantMessage[];
} = {}): Promise<AssistantContextData> {
  const state = useAppStore.getState();
  const nodes = state.nodes as AnyNode[];
  const map = buildNodeMap(nodes);
  const rawTasks = sortTasks(pickActiveTasks(nodes)).slice(0, 60);
  const summaries = rawTasks.map((task) => summarizeTask(task, map));
  const savedInfo = options.savedInfo ?? loadSavedInfo();
  const prompt = options.prompt ?? loadPrompt();
  const history = (options.messages ?? []).slice(-24);
  const historyText = formatHistory(history);

  // Получаем запись дневника за сегодня
  const today = new Date().toISOString().split('T')[0];
  let diaryText = '';
  try {
    const todayEntry = await db.diary.where('date').equals(today).first();
    if (todayEntry && todayEntry.content) {
      const moodText = todayEntry.mood ? ` [Настроение: ${todayEntry.mood}]` : '';
      diaryText = `Дневник за сегодня${moodText}:\n${todayEntry.content}`;
    }
  } catch {
    // Игнорируем ошибки доступа к БД
  }

  const lines = summaries.map((info, idx) => `${idx + 1}. ${formatTaskLine(info)}`);
  const contextParts = [
    `Промпт ассистента:\n${prompt || 'не задан'}`,
    `Сохранённая информация пользователя:\n${savedInfo || 'не заполнено'}`,
    `Актуальные и актуализированные задачи (${summaries.length}):\n${lines.join('\n') || '— нет активных задач —'}`,
  ];
  
  if (diaryText) {
    contextParts.push(diaryText);
  }
  
  if (historyText) {
    contextParts.push(`История диалога за сегодня (от свежих к ранним):\n${historyText}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    savedInfo,
    prompt,
    activeTasks: summaries,
    history,
    contextText: contextParts.join('\n\n').slice(0, 14000),
  };
}

