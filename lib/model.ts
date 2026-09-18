import { createTranslator } from './i18n.ts';
import type { Locale } from './i18n.ts';
export type Energy = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export interface Goal {
  id: string;
  title: string;
  outcome: string;
  deadline: string;
  priority: number;
  color: string;
}
export interface Task {
  id: string;
  goalId: string;
  title: string;
  outcome: string;
  estimate: number;
  remaining: number;
  energy: Energy;
  splittable: boolean;
  dependsOn: string[];
  fixedStart: string;
  status: TaskStatus;
  habitId?: string;
  habitDate?: string;
}
export interface Habit {
  id: string;
  title: string;
  minutes: number;
  energy: Energy;
  priority: number;
  days: number[];
  enabled: boolean;
  splittable: boolean;
}
export interface FeedbackEntry {
  id: string;
  category: 'suggestion' | 'bug' | 'other';
  message: string;
  createdAt: number;
}
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  kind: 'deadline' | 'task' | 'timer';
  goalId?: string;
  taskId?: string;
}
export interface Commitment {
  id: string;
  title: string;
  start: string;
  end: string;
}
export interface Checkin {
  date: string;
  start: string;
  end: string;
  nextDay: boolean;
  energy: Energy;
  mood: string;
  commitments: Commitment[];
}
export interface Settings {
  name: string;
  usualStart: string;
  usualEnd: string;
  usualDays: number[];
  futureKnown: boolean;
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  preparation: number;
  buffer: number;
  companion: boolean;
  notifications: boolean;
  sound: boolean;
  notifyStart: string;
  notifyEnd: string;
  demoTimer: boolean;
}
export interface Block {
  id: string;
  taskId?: string;
  title: string;
  start: number;
  end: number;
  type: 'focus' | 'break' | 'buffer' | 'commitment' | 'preparation';
  reason: string;
  locked: boolean;
  done: boolean;
}
export interface Plan {
  id: string;
  date: string;
  checkin: Checkin;
  blocks: Block[];
  notes: string[];
  generatedAt: number;
  habitTasks?: Task[];
  habitSignature?: string;
  planningMode?: 'local' | 'ai';
}
export interface Timer {
  id: string;
  taskId: string;
  blockId?: string;
  kind: 'focus' | 'break';
  status: 'running' | 'paused' | 'awaiting';
  durationMs: number;
  elapsedMs: number;
  segmentStart: number | null;
  startedAt: number;
  demo: boolean;
}
export interface Session {
  id: string;
  taskId: string;
  title: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  demo: boolean;
  note?: string;
}
export interface Reflection {
  id: string;
  date: string;
  note: string;
  mood: string;
}
export interface AppState {
  version: 1;
  goals: Goal[];
  tasks: Task[];
  habits: Habit[];
  feedbackEntries: FeedbackEntry[];
  notifications: AppNotification[];
  settings: Settings;
  checkin: Checkin;
  plan: Plan | null;
  previousPlan: Plan | null;
  previousSkipped: { date: string; ids: string[] } | null;
  timer: Timer | null;
  sessions: Session[];
  reflections: Reflection[];
  skipped: { date: string; ids: string[] };
  notified: string[];
  reminderSnoozes: Record<string, number>;
}
export const MINUTE = 60000;
export const uid = () => crypto.randomUUID();
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function clockTime(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
export function at(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime();
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function initialState(): AppState {
  const date = localDate();
  return {
    version: 1,
    goals: [],
    tasks: [],
    habits: [],
    feedbackEntries: [],
    notifications: [],
    settings: {
      name: '',
      usualStart: '20:00',
      usualEnd: '22:30',
      usualDays: [1, 2, 3, 4, 5, 6, 0],
      futureKnown: false,
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      preparation: 10,
      buffer: 10,
      companion: true,
      notifications: false,
      sound: false,
      notifyStart: '08:00',
      notifyEnd: '23:00',
      demoTimer: false,
    },
    checkin: {
      date,
      start: '20:00',
      end: '22:30',
      nextDay: false,
      energy: 'medium',
      mood: '',
      commitments: [],
    },
    plan: null,
    previousPlan: null,
    previousSkipped: null,
    timer: null,
    sessions: [],
    reflections: [],
    skipped: { date, ids: [] },
    notified: [],
    reminderSnoozes: {},
  };
}
export const activeTask = (t: Task) =>
  t.status !== 'done' && t.status !== 'cancelled';
export function exampleState(base: AppState, locale: Locale = 'en'): AppState {
  const tr = createTranslator(locale);
  const date = localDate();
  const goals: Goal[] = [
    {
      id: uid(),
      title: tr('完成个人作品集'),
      outcome: tr('三个项目案例完成文字与排版'),
      deadline: `${addDays(date, 14)}T22:30`,
      priority: 3,
      color: '#4f67a4',
    },
    {
      id: uid(),
      title: tr('把阅读变成习惯'),
      outcome: tr('读完一本书并整理读书笔记'),
      deadline: `${addDays(date, 21)}T22:30`,
      priority: 1,
      color: '#bc9150',
    },
  ];
  const a = uid(),
    b = uid();
  const tasks: Task[] = [
    {
      id: a,
      goalId: goals[0].id,
      title: tr('整理项目 A 的三张截图'),
      outcome: tr('选出三张清晰截图，保存到素材文件夹'),
      estimate: 25,
      remaining: 25,
      energy: 'medium',
      splittable: true,
      dependsOn: [],
      fixedStart: '',
      status: 'todo',
    },
    {
      id: b,
      goalId: goals[0].id,
      title: tr('写项目 A 的介绍草稿'),
      outcome: tr('说明背景、自己的贡献和项目结果'),
      estimate: 25,
      remaining: 25,
      energy: 'high',
      splittable: true,
      dependsOn: [a],
      fixedStart: '',
      status: 'todo',
    },
    {
      id: uid(),
      goalId: goals[1].id,
      title: tr('阅读一节并记下一句话'),
      outcome: tr('阅读一节，摘录一句有启发的内容'),
      estimate: 15,
      remaining: 15,
      energy: 'low',
      splittable: true,
      dependsOn: [],
      fixedStart: '',
      status: 'todo',
    },
  ];
  return {
    ...base,
    goals: [...base.goals, ...goals],
    tasks: [...base.tasks, ...tasks],
  };
}
