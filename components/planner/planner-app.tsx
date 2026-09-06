'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Moon,
  Sun,
  Target,
  Clock3,
  History,
  Settings2,
  ArrowRight,
  Sparkles,
  Plus,
  Play,
  Pause,
  Square,
  RotateCcw,
  LockKeyhole,
  LockKeyholeOpen,
  CheckCircle2,
  Coffee,
  CalendarDays,
  ChevronRight,
  Trash2,
  X,
  Send,
  Download,
  Pencil,
  LoaderCircle,
  Bell,
  MessageSquare,
  Repeat2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GoalEditor } from './goal-editor';
import { SettingsView, downloadJSON } from './settings-view';
import { RecordsView } from './records-view';
import { HabitsView } from './habits-view';
import { CalendarView } from './calendar-view';
import { FeedbackDialog } from './feedback-dialog';
import { NotificationCenter } from './notification-center';
import { tasksForDay, taskOwner } from '@/lib/habits';
import {
  addNotification,
  syncDeadlines,
  reminderRelevant,
} from '@/lib/notifications';
import {
  acceptDailyPlan,
  planningCandidates,
  validatePlanningAdvice,
} from '@/lib/planning';
import type { PlanningAdvice } from '@/lib/scheduler';
import { Field, Choice, Check, energyOptions } from './controls';
import { useAppState, readState, atomicUpdate, rawBackup } from '@/lib/store';
import {
  initialState,
  exampleState,
  localDate,
  clockTime,
  MINUTE,
  uid,
  activeTask,
} from '@/lib/model';
import type {
  AppState,
  Block,
  Checkin,
  Energy,
  Goal,
  Plan,
  Task,
} from '@/lib/model';
import {
  generatePlan,
  capacityRisks,
  parseCheckin,
  windowFor,
} from '@/lib/scheduler';
import { elapsed, pauseTimer, resumeTimer, settleTimer } from '@/lib/timer';

import { currentPlan, startFocus, recordProgress } from '@/lib/actions';

const nav = [
  { icon: Sun, label: '今天', key: 'today' },
  { icon: Target, label: '我的计划', key: 'goals' },
  { icon: CalendarDays, label: '日历', key: 'calendar' },
  { icon: Repeat2, label: '每日习惯', key: 'habits' },
  { icon: History, label: '专注记录', key: 'records' },
  { icon: Settings2, label: '偏好设置', key: 'settings' },
];
type View = 'today' | 'goals' | 'calendar' | 'habits' | 'records' | 'settings';
const datetime = (time: number) =>
  `${localDate(new Date(time))}T${new Date(time).toTimeString().slice(0, 5)}`;
const duration = (b: Block) => Math.round((b.end - b.start) / MINUTE);
function Navigation({
  view,
  onChange,
  onFeedback,
}: {
  view: View;
  onChange: (v: View) => void;
  onFeedback: () => void;
}) {
  const sidebar = useSidebar();
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="brand">
          <Moon size={26} />
          <div>
            晚钟<small>EVENING BELL</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <div className="nav-caption">属于自己的时间</div>
        <SidebarMenu>
          {nav.map(({ icon: Icon, label, key }) => (
            <SidebarMenuItem key={key}>
              <SidebarMenuButton
                isActive={key === view}
                onClick={() => {
                  onChange(key as View);
                  sidebar.setOpenMobile(false);
                }}
              >
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                onFeedback();
                sidebar.setOpenMobile(false);
              }}
            >
              <MessageSquare />
              <span>反馈</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
function notifyDevice(state: AppState, title: string, body: string) {
  const time = new Date().toTimeString().slice(0, 5),
    s = state.settings;
  const allowed =
    s.notifyStart <= s.notifyEnd
      ? time >= s.notifyStart && time < s.notifyEnd
      : time >= s.notifyStart || time < s.notifyEnd;
  if (!allowed) return;
  if (
    s.notifications &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, { body, icon: '/icon.svg' });
    } catch {
      /* In-app notification is always retained. */
    }
  }
  if (s.sound) {
    try {
      const audio = new AudioContext();
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.frequency.value = 660;
      gain.gain.value = 0.05;
      osc.start();
      osc.stop(audio.currentTime + 0.2);
      osc.onended = () => void audio.close();
    } catch {
      /* Browser may require a user gesture. */
    }
  }
}

export default function PlannerApp() {
  const { state, ready, error: storageError } = useAppState();
  const [view, setView] = useState<View>('today'),
    [notice, setNotice] = useState(''),
    [appError, setAppError] = useState(''),
    [now, setNow] = useState(() => Date.now());
  const [editor, setEditor] = useState<Goal | 'new' | null>(null),
    [checkinOpen, setCheckinOpen] = useState(false),
    [draftCheckin, setDraftCheckin] = useState<Checkin>(initialState().checkin),
    [preview, setPreview] = useState<Plan | null>(null),
    [previewError, setPreviewError] = useState('');
  const [chat, setChat] = useState(''),
    [chatReply, setChatReply] = useState(''),
    [chatBusy, setChatBusy] = useState(false),
    [aiMode, setAiMode] = useState('local');
  const [manualTask, setManualTask] = useState<Task | null>(null),
    [switchTarget, setSwitchTarget] = useState<{
      task: Task;
      block?: Block;
    } | null>(null),
    [pendingStart, setPendingStart] = useState<{
      task: Task;
      block?: Block;
    } | null>(null);
  const [reminder, setReminder] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const tickBusy = useRef(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [planningBusy, setPlanningBusy] = useState(false);
  const planningRequest = useRef(0);
  const safely = async (fn: () => Promise<unknown>) => {
    setAppError('');
    try {
      await fn();
    } catch (e) {
      setAppError((e as Error).message || '保存失败，请检查浏览器存储空间。');
    }
  };
  useEffect(() => {
    if (!ready || storageError) return;
    void fetch('/api/agent')
      .then((r) => r.json() as Promise<{ mode?: string }>)
      .then((r) => setAiMode(r.mode || 'local'))
      .catch(() => setAiMode('local'));
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [ready, storageError]);
  useEffect(() => {
    if (!ready || storageError) return;
    const tick = async () => {
      setNow(Date.now());
      if (tickBusy.current) return;
      tickBusy.current = true;
      try {
        const current = readState(),
          t = current.timer;
        if (t?.status === 'running' && elapsed(t) >= t.durationMs) {
          let won = false;
          await atomicUpdate((old) => {
            if (
              old.timer?.id !== t.id ||
              old.timer.status !== 'running' ||
              elapsed(old.timer) < old.timer.durationMs
            )
              return old;
            won = true;
            return addNotification(settleTimer(old), {
              id: `timer:${t.id}`,
              title: t.kind === 'focus' ? '专注结束' : '休息结束',
              message:
                t.kind === 'focus'
                  ? '计时已记录，请确认任务进度。'
                  : '准备好了，可以开始下一步。',
              createdAt: Date.now(),
              kind: 'timer',
              taskId: t.taskId,
            });
          });
          if (won) {
            setNotice(
              t.kind === 'focus'
                ? '这一段专注结束了，请确认任务进度。'
                : '休息结束，可以按自己的节奏继续。',
            );
            notifyDevice(
              current,
              t.kind === 'focus' ? '专注结束' : '休息结束',
              t.kind === 'focus'
                ? '计时已记录，请确认任务是否完成。'
                : '准备好了再开始下一步。',
            );
          }
        }
        const plan = current.plan;
        if (plan)
          for (const b of plan.blocks) {
            const id = `${plan.id}:${b.id}`;
            const snooze = current.reminderSnoozes[id];
            if (
              b.type !== 'focus' ||
              b.done ||
              current.notified.includes(id) ||
              current.timer?.blockId === b.id
            )
              continue;
            const due = snooze
              ? snooze <= Date.now()
              : b.start > Date.now() && b.start - Date.now() <= 5 * MINUTE;
            if (!due || b.end < Date.now()) continue;
            let won = false;
            await atomicUpdate((old) => {
              if (
                !reminderRelevant(old, plan.id, b.id) ||
                old.notified.includes(id)
              )
                return old;
              won = true;
              return addNotification(
                { ...old, notified: [...old.notified.slice(-999), id] },
                {
                  id: `task:${id}`,
                  title: '接下来的安排',
                  message: `${b.title} · ${clockTime(b.start)}`,
                  createdAt: Date.now(),
                  kind: 'task',
                  taskId: b.taskId,
                },
              );
            });
            if (won) {
              setReminder({ id, title: b.title });
              notifyDevice(
                current,
                '接下来的一小步',
                `${b.title} · ${clockTime(b.start)}`,
              );
            }
            break;
          }
        if (syncDeadlines(readState()) !== readState())
          await atomicUpdate((s) => syncDeadlines(s));
      } catch (e) {
        setAppError((e as Error).message);
      } finally {
        tickBusy.current = false;
      }
    };
    const timer = setInterval(() => void tick(), 1000);
    const visible = () => void tick();
    document.addEventListener('visibilitychange', visible);
    void tick();
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [ready, storageError]);

  useEffect(() => {
    if (!ready) return;
    type Tool = {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const register = (tool: Tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'read_personal_plan',
      title: '读取目标和今日安排',
      description:
        '返回当前设备保存的目标、任务、今日安排及计时状态。只读，包含用户输入。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => {
        const s = readState();
        return {
          goals: s.goals,
          tasks: s.tasks,
          habits: s.habits,
          plan: s.plan,
          timer: s.timer,
        };
      },
    });
    register({
      name: 'stage_daily_schedule',
      title: '预览今日安排',
      description:
        '根据明确的起止时间和精力生成预览并展示；不会采纳或覆盖当前计划。',
      inputSchema: {
        type: 'object',
        properties: {
          start: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          end: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          energy: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['start', 'end', 'energy'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        const p = input as Record<string, string>;
        if (
          !p ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end) ||
          !['low', 'medium', 'high'].includes(p.energy)
        )
          throw new Error('起止时间或精力无效。');
        const s = readState();
        const plan = generatePlan(s, {
          ...s.checkin,
          date: localDate(),
          start: p.start,
          end: p.end,
          energy: p.energy as Energy,
        });
        setPreview(plan);
        setView('today');
        return {
          status: 'preview',
          planId: plan.id,
          blocks: plan.blocks,
          notes: plan.notes,
        };
      },
    });
    return () => lifecycle.abort();
  }, [ready]);

  const openCheckin = () => {
    const current = readState();
    const today = localDate();
    const active = currentPlan(current);
    if (active && active.date !== today) {
      setDraftCheckin({ ...active.checkin });
      setCheckinOpen(true);
      setPreviewError('');
      return;
    }
    const currentTime = new Date().toTimeString().slice(0, 5);
    setDraftCheckin({
      ...current.checkin,
      date: today,
      nextDay:
        current.checkin.date === today
          ? current.checkin.nextDay
          : current.settings.usualEnd < current.settings.usualStart,
      start:
        current.checkin.date === today
          ? current.checkin.start
          : current.settings.usualStart,
      end:
        current.checkin.date === today
          ? current.checkin.end
          : current.settings.usualEnd,
      mood: current.checkin.date === today ? current.checkin.mood : '',
      commitments:
        current.checkin.date === today ? current.checkin.commitments : [],
    });
    if (currentTime > current.checkin.start)
      setDraftCheckin((c) => ({ ...c, start: currentTime }));
    setCheckinOpen(true);
    setPreviewError('');
  };
  async function buildPreview(c: Checkin) {
    setPreviewError('');
    setPlanningBusy(true);
    const request = ++planningRequest.current;
    try {
      const snapshot = readState();
      let advice: PlanningAdvice | undefined,
        fallback = false;
      const tasks = planningCandidates(snapshot, c);
      if (aiMode === 'ai' && tasks.length) {
        try {
          const response = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'prioritize', checkin: c, tasks }),
            signal: AbortSignal.timeout(28000),
          });
          const data = (await response.json()) as {
            mode?: string;
            advice?: unknown;
          };
          if (!response.ok) throw new Error('模型暂不可用');
          if (data.mode === 'ai')
            advice = validatePlanningAdvice(
              data.advice,
              tasks.map((t) => t.id),
            );
          else fallback = true;
        } catch {
          fallback = true;
        }
      }
      if (request !== planningRequest.current) return;
      if (
        JSON.stringify(planningCandidates(readState(), c)) !==
        JSON.stringify(tasks)
      )
        throw new Error('任务或习惯已更新，请重新生成安排。');
      const plan = generatePlan(readState(), c, Date.now(), advice);
      if (fallback)
        plan.notes.unshift(
          '小晚的模型服务暂不可用，已使用本地规则安排任务与每日习惯。',
        );
      else if (advice)
        plan.notes.unshift(
          '小晚已结合今晚的状态、截止目标与每日习惯建议排序；时间和依赖已由调度器校验。',
        );
      setPreview(plan);
      setCheckinOpen(false);
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      if (request === planningRequest.current) setPlanningBusy(false);
    }
  }
  async function accept() {
    if (!preview) return;
    await safely(async () => {
      await atomicUpdate((old) => acceptDailyPlan(old, preview));
      setPreview(null);
      setNotice('今晚的安排已采纳。先从眼前的一小步开始。');
    });
  }
  async function start(task: Task, block?: Block, force = false) {
    setAppError('');
    try {
      const current = readState();
      if (current.timer && !force) {
        setSwitchTarget({ task, block });
        return;
      }
      await atomicUpdate((s) => startFocus(s, task.id, block?.id));
      setView('today');
      setNotice('只专注眼前这一件事。准备好了，我们开始。');
    } catch (e) {
      setAppError((e as Error).message);
    }
  }
  async function feedback(
    taskId: string,
    complete: boolean,
    remaining: number,
    rest: boolean,
    stopToday = false,
  ) {
    await safely(async () => {
      if (!complete && (!Number.isFinite(remaining) || remaining < 1))
        throw new Error('未完成任务的剩余时长至少为 1 分钟。');
      await atomicUpdate((s) =>
        recordProgress(
          s,
          taskId,
          complete,
          remaining,
          rest && !pendingStart,
          stopToday,
        ),
      );
      setManualTask(null);
      setNotice(
        complete
          ? '这一步完成了，给自己的努力一点肯定。'
          : '进度已记录，剩下的可以按实际状态重新安排。',
      );
      if (pendingStart) {
        const next = pendingStart;
        setPendingStart(null);
        await start(next.task, next.block, true);
      }
    });
  }
  async function chatSend() {
    if (!chat.trim() || chatBusy) return;
    setChatBusy(true);
    setChatReply('');
    try {
      const result = parseCheckin(chat, readState().checkin);
      if (
        JSON.stringify(result.checkin) !== JSON.stringify(readState().checkin)
      ) {
        setDraftCheckin(result.checkin);
        setCheckinOpen(true);
        setChatReply(result.reply);
      } else if (aiMode === 'ai') {
        const current = readState();
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'coach',
            message: chat,
            context: {
              checkin: current.checkin,
              goals: current.goals.map((g) => ({
                title: g.title,
                deadline: g.deadline,
              })),
              habits: current.habits,
              tasks: tasksForDay(
                current,
                currentPlan(current)?.date || localDate(),
              ).map((t) => ({
                title: t.title,
                status: t.status,
                remaining: t.remaining,
              })),
            },
          }),
        });
        const result = (await response.json()) as {
          error?: string;
          message: string;
        };
        if (!response.ok) throw new Error(result.error);
        setChatReply(result.message);
      } else setChatReply(result.reply);
      setChat('');
    } catch (e) {
      setChatReply((e as Error).message);
    } finally {
      setChatBusy(false);
    }
  }
  const timer = state.timer,
    spent = timer ? elapsed(timer, now) : 0,
    remainingMs = timer
      ? Math.max(0, timer.durationMs - spent)
      : state.settings.focusMinutes * MINUTE;
  const clock = `${String(Math.floor(Math.ceil(remainingMs / 1000) / 60)).padStart(2, '0')}:${String(Math.ceil(remainingMs / 1000) % 60).padStart(2, '0')}`;
  const todayPlan = currentPlan(state, now);
  const nextBlock = todayPlan?.blocks.find(
    (b) =>
      b.type === 'focus' &&
      !b.done &&
      b.end > now &&
      state.tasks.some((t) => t.id === b.taskId && activeTask(t)),
  );
  const nextTask =
    state.tasks.find((t) => t.id === (timer?.taskId || nextBlock?.taskId)) ||
    tasksForDay(state, todayPlan?.date || localDate()).find(activeTask);
  const hasWork =
    state.tasks.some((t) => !t.habitId && activeTask(t)) ||
    state.habits.some((h) => h.enabled);
  let risks: ReturnType<typeof capacityRisks> = [];
  try {
    risks = capacityRisks(
      state,
      todayPlan?.checkin || { ...state.checkin, date: localDate() },
    );
  } catch {}
  const totalMinutes =
    state.sessions
      .filter(
        (s) => !s.demo && localDate(new Date(s.startedAt)) === localDate(),
      )
      .reduce((n, s) => n + s.durationMs, 0) / MINUTE;
  const titles = {
    today: '把今晚，留给自己。',
    goals: '把想做的事，慢慢做成。',
    records: '每一小步，都值得被看见。',
    settings: '找到让自己舒服的节奏。',
    calendar: '重要的日子，一眼看见。',
    habits: '把日常的小事，留进生活。',
  };
  if (storageError)
    return (
      <main className="page-content">
        <div className="panel">
          <h1>本地数据需要检查</h1>
          <p className="alert error">{storageError}</p>
          <Button
            className="mt-4"
            onClick={() => downloadJSON(rawBackup(), '晚钟-原始数据备份.json')}
          >
            <Download /> 导出原始数据
          </Button>
          <p className="muted mt-4">
            当前内容未被覆盖。请保留备份后联系开发者检查格式。
          </p>
        </div>
      </main>
    );
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '232px' } as React.CSSProperties}
    >
      <Navigation
        view={view}
        onChange={setView}
        onFeedback={() => setFeedbackOpen(true)}
      />
      <main className="workspace">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>
              {state.settings.name
                ? `${state.settings.name} 的个人空间`
                : '我的个人空间'}
            </span>
          </div>
          <div className="topbar-actions">
            <span className="status-pill">
              <span />
              {ready
                ? new Date(now).toLocaleDateString('zh-CN', {
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long',
                  })
                : '为自己留一点时间'}
            </span>
            <Button
              variant="ghost"
              className="notification-trigger"
              aria-label={`通知，${state.notifications.filter((n) => !n.read).length} 条未读`}
              onClick={() => setNotificationsOpen(true)}
              disabled={!ready}
            >
              <Bell />
              <span className="notification-label">通知</span>
              {state.notifications.some((n) => !n.read) && (
                <span className="notification-badge">
                  {Math.min(
                    99,
                    state.notifications.filter((n) => !n.read).length,
                  )}
                </span>
              )}
            </Button>
            <Button onClick={() => setEditor('new')} disabled={!ready}>
              <Plus />
              新建计划
            </Button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR TIME, YOUR PACE</p>
              <h1>{titles[view]}</h1>
              <p className="muted">
                {view === 'today'
                  ? '从一个小小的行动开始，按照你的节奏来。'
                  : view === 'goals'
                    ? '目标有方向，每一步有自己的完成标准。'
                    : view === 'records'
                      ? '记录投入，也给变化留出空间。'
                      : view === 'calendar'
                        ? '查看每个计划的 deadline，提前为重要的事情留出时间。'
                        : view === 'habits'
                          ? '不用设置截止日期，小晚会把当天的习惯一起考虑进今晚的安排。'
                          : '时间、提醒和陪伴，都由你来决定。'}
              </p>
            </div>
          </div>
          {notice && (
            <output className="notice">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <Button
                variant="ghost"
                aria-label="关闭提示"
                onClick={() => setNotice('')}
              >
                <X size={16} />
              </Button>
            </output>
          )}
          {appError && (
            <div className="alert error mb-5" role="alert">
              {appError}
              <Button variant="ghost" onClick={() => setAppError('')}>
                关闭
              </Button>
            </div>
          )}
          {reminder && (
            <div className="notice reminder" role="alert">
              <Clock3 />
              <span>接下来：{reminder.title}</span>
              <Button
                variant="outline"
                onClick={() =>
                  safely(async () => {
                    const id = reminder.id;
                    await atomicUpdate((s) => ({
                      ...s,
                      notified: s.notified.filter((x) => x !== id),
                      reminderSnoozes: {
                        ...s.reminderSnoozes,
                        [id]: Date.now() + 5 * MINUTE,
                      },
                    }));
                    setReminder(null);
                  })
                }
              >
                五分钟后提醒
              </Button>
              <Button variant="ghost" onClick={() => setReminder(null)}>
                知道了
              </Button>
            </div>
          )}
          {view === 'today' && (
            <div className="today-grid">
              <section>
                <div className="checkin-card">
                  <span className="tiny-label">
                    <Sparkles size={16} /> 晚间报到
                  </span>
                  <h2>
                    {state.settings.name ? `${state.settings.name}，` : ''}
                    回来了，今天过得怎么样？
                  </h2>
                  <p>
                    {todayPlan
                      ? `今天 ${todayPlan.checkin.start}—${todayPlan.checkin.end}，每一步都可以调整。`
                      : '告诉我你的时间和状态，我们一起安排今晚。'}
                  </p>
                  <div className="checkin-summary">
                    <span>
                      <Clock3 size={16} />
                      {todayPlan
                        ? `${Math.max(0, Math.floor((windowFor(todayPlan.checkin)[1] - now) / MINUTE))} 分钟可用`
                        : '按实际到家时间安排'}
                    </span>
                    <span>
                      <Coffee size={16} /> 为休息留一点空白
                    </span>
                  </div>
                  <Button
                    className="yellow-button"
                    onClick={openCheckin}
                    disabled={!ready}
                  >
                    {todayPlan ? '时间变了？重新安排' : '我到家了，安排今晚'}
                    <ArrowRight />
                  </Button>
                </div>
                <div className="mini-stats">
                  <div>
                    <span>今天专注</span>
                    <strong>
                      {Math.floor(totalMinutes)}
                      <small> 分钟</small>
                    </strong>
                  </div>
                  <div>
                    <span>待推进目标</span>
                    <strong>
                      {
                        state.goals.filter((g) =>
                          state.tasks.some(
                            (t) => t.goalId === g.id && activeTask(t),
                          ),
                        ).length
                      }
                      <small> 个</small>
                    </strong>
                  </div>
                  <div>
                    <span>今晚任务</span>
                    <strong>
                      {todayPlan?.blocks.filter(
                        (b) => b.type === 'focus' && !b.done,
                      ).length || 0}
                      <small> 段</small>
                    </strong>
                  </div>
                </div>
                <section className="panel timeline-panel">
                  <div className="section-heading">
                    <h2>今晚的安排</h2>
                    <div className="actions">
                      {state.previousPlan && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            safely(async () => {
                              await atomicUpdate((s) => {
                                if (s.timer)
                                  throw new Error('请先结束当前计时。');
                                return {
                                  ...s,
                                  plan: s.previousPlan,
                                  skipped: s.previousSkipped || s.skipped,
                                  previousPlan: null,
                                  previousSkipped: null,
                                  checkin: s.previousPlan?.checkin || s.checkin,
                                  notified: [],
                                  reminderSnoozes: {},
                                };
                              });
                              setNotice('已撤销上一次重排。');
                            })
                          }
                        >
                          <RotateCcw /> 撤销重排
                        </Button>
                      )}
                      <span className="tag">
                        {todayPlan ? '已采纳' : '等待安排'}
                      </span>
                    </div>
                  </div>
                  {!todayPlan ? (
                    <div className="empty-state">
                      <Target />
                      <h3>
                        {hasWork
                          ? '准备好了，就从报到开始'
                          : '你想先完成哪件事？'}
                      </h3>
                      <p>
                        {hasWork
                          ? '根据今天的实际时间，为目标安排下一步。'
                          : '添加一个目标，让今晚的第一步清晰起来。'}
                      </p>
                      <div className="actions justify-center">
                        <Button
                          variant="outline"
                          onClick={() =>
                            hasWork ? openCheckin() : setEditor('new')
                          }
                        >
                          {hasWork ? '安排今晚' : '创建第一个计划'}
                          <ArrowRight />
                        </Button>
                        {!state.goals.length && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              safely(async () => {
                                await atomicUpdate((s) => exampleState(s));
                                setNotice('已加入示例目标，可编辑或删除。');
                              })
                            }
                          >
                            试用示例目标
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="timeline">
                      {todayPlan.blocks.map((b, i) => {
                        const t = state.tasks.find((t) => t.id === b.taskId);
                        return (
                          <div
                            className={`timeline-row ${b.type} ${b.done ? 'done' : ''}`}
                            key={b.id}
                          >
                            <div className="timeline-time">
                              {clockTime(b.start)}
                              <small>{clockTime(b.end)}</small>
                            </div>
                            <div className="timeline-track">
                              <span>
                                {b.done ? (
                                  <CheckCircle2 size={16} />
                                ) : b.type === 'focus' ? (
                                  <span />
                                ) : (
                                  <Coffee size={13} />
                                )}
                              </span>
                            </div>
                            <div className="timeline-content">
                              <div className="timeline-title">
                                <h3>{b.title}</h3>
                                <span className="duration">
                                  {duration(b)} 分钟
                                </span>
                              </div>
                              {b.type === 'focus' && (
                                <>
                                  <p className="muted">
                                    {taskOwner(state, t)} · {b.reason}
                                  </p>
                                  <div className="task-actions">
                                    <span className="tag">
                                      {b.done
                                        ? '已记录'
                                        : i ===
                                            todayPlan.blocks.findIndex(
                                              (x) =>
                                                x.type === 'focus' && !x.done,
                                            )
                                          ? '优先完成'
                                          : '随后推进'}
                                    </span>
                                    {!b.done && t && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          onClick={() => start(t, b)}
                                        >
                                          <Play size={14} /> 开始专注
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          aria-label={
                                            b.locked ? '解锁任务' : '锁定任务'
                                          }
                                          onClick={() =>
                                            safely(async () => {
                                              await atomicUpdate((s) => ({
                                                ...s,
                                                plan: s.plan
                                                  ? {
                                                      ...s.plan,
                                                      blocks: s.plan.blocks.map(
                                                        (x) =>
                                                          x.id === b.id
                                                            ? {
                                                                ...x,
                                                                locked:
                                                                  !x.locked,
                                                              }
                                                            : x,
                                                      ),
                                                    }
                                                  : null,
                                              }));
                                            })
                                          }
                                        >
                                          {b.locked ? (
                                            <LockKeyhole size={14} />
                                          ) : (
                                            <LockKeyholeOpen size={14} />
                                          )}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          onClick={() =>
                                            safely(async () => {
                                              await atomicUpdate((s) => {
                                                if (s.timer?.taskId === t.id)
                                                  throw new Error(
                                                    '请先结束当前计时。',
                                                  );
                                                return {
                                                  ...s,
                                                  skipped: {
                                                    date: todayPlan.date,
                                                    ids: [
                                                      ...(s.skipped.date ===
                                                      todayPlan.date
                                                        ? s.skipped.ids
                                                        : []),
                                                      t.id,
                                                    ],
                                                  },
                                                  previousPlan: s.plan,
                                                  previousSkipped: s.skipped,
                                                  plan: s.plan
                                                    ? {
                                                        ...s.plan,
                                                        blocks:
                                                          s.plan.blocks.filter(
                                                            (x) =>
                                                              x.taskId !==
                                                                t.id || x.done,
                                                          ),
                                                      }
                                                    : null,
                                                };
                                              });
                                              setNotice(
                                                t.habitId
                                                  ? '今天先跳过，下次重复日期会重新安排。'
                                                  : '已从今天的安排中延后，原任务与截止时间保留。',
                                              );
                                            })
                                          }
                                        >
                                          今天延后
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {!todayPlan.blocks.length && (
                        <div className="empty-state">
                          <Moon />
                          <h3>今天可以休息</h3>
                          <p>计划和目标都还在，下次有时间再继续。</p>
                        </div>
                      )}
                    </div>
                  )}
                  {todayPlan?.notes.length ? (
                    <details className="plan-notes">
                      <summary>
                        安排说明与后续事项（{todayPlan.notes.length}）
                      </summary>
                      {todayPlan.notes.map((n, i) => (
                        <p key={i}>{n}</p>
                      ))}
                    </details>
                  ) : null}
                </section>
                {risks.length > 0 && (
                  <section className="panel mt-5">
                    <h2 className="icon-heading">
                      <CalendarDays size={18} /> 截止日期与可用时间
                    </h2>
                    {risks.map((r) => (
                      <div
                        className={`risk-item ${r.gap ? 'at-risk' : ''}`}
                        key={r.deadline}
                      >
                        <strong>{r.deadline.replace('T', ' ')} 前</strong>
                        <p>
                          {r.goals.join('、')}：累计还需 {r.demand} 分钟；
                          {r.capacity === null
                            ? '未来时间信息不足'
                            : `预计可安排 ${r.capacity} 分钟${r.gap ? `，缺少约 ${r.gap} 分钟` : '，当前估算有空间'}`}
                          。
                        </p>
                        <small>
                          {r.label}。
                          {r.gap
                            ? '可减少目标范围、增加可用时段，或自行修改截止时间。'
                            : '实际进度变化后需要重新评估。'}
                        </small>
                      </div>
                    ))}
                  </section>
                )}
              </section>
              <aside className="right-column">
                <section className="panel focus-panel">
                  <div className="section-heading">
                    <h2>
                      <Clock3 size={18} />
                      {timer?.kind === 'break' ? '休息一小会' : '专注一小会'}
                    </h2>
                    <span className="tag">
                      {timer?.demo
                        ? '演示模式'
                        : timer?.status === 'paused'
                          ? '已暂停'
                          : '番茄钟'}
                    </span>
                  </div>
                  <div
                    className="clock-ring"
                    style={
                      {
                        '--progress': `${timer ? (spent / timer.durationMs) * 100 : 0}%`,
                      } as React.CSSProperties
                    }
                  >
                    <div>
                      <strong aria-label="剩余时间">{clock}</strong>
                      <span>
                        {timer?.kind === 'break'
                          ? '起身走一走，看看远处'
                          : timer?.status === 'awaiting'
                            ? '这一段已记录'
                            : timer
                              ? '只做眼前这一件事'
                              : '给当下的一件事'}
                      </span>
                    </div>
                  </div>
                  <h3 className="focus-task">
                    {timer?.kind === 'break'
                      ? '给自己充个电'
                      : nextTask?.title || '选择一件值得开始的小事'}
                  </h3>
                  <div className="actions justify-center mt-5">
                    {timer && timer.status !== 'awaiting' ? (
                      <>
                        <Button
                          onClick={() =>
                            safely(async () => {
                              await atomicUpdate((s) => ({
                                ...s,
                                timer: s.timer
                                  ? s.timer.status === 'running'
                                    ? pauseTimer(s.timer)
                                    : resumeTimer(s.timer)
                                  : null,
                              }));
                            })
                          }
                        >
                          {timer.status === 'running' ? <Pause /> : <Play />}
                          {timer.status === 'running' ? '暂停' : '继续'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            safely(async () => {
                              await atomicUpdate((s) =>
                                s.timer?.kind === 'break'
                                  ? { ...s, timer: null }
                                  : settleTimer(s),
                              );
                            })
                          }
                        >
                          <Square /> 结束
                        </Button>
                      </>
                    ) : !timer ? (
                      <Button
                        className="w-full"
                        disabled={!nextTask}
                        onClick={() => nextTask && start(nextTask, nextBlock)}
                      >
                        <Play /> 开始专注
                      </Button>
                    ) : (
                      <p className="muted">请在进度窗口中完成反馈。</p>
                    )}
                  </div>
                  <p className="muted mt-4">
                    {timer?.kind === 'break'
                      ? '休息不会计入专注时长。'
                      : '专注结束后，由你确认是否完成。'}
                  </p>
                </section>
                {state.settings.companion && (
                  <>
                    <section className="panel chat-panel">
                      <div className="section-heading">
                        <h2>和小晚聊聊</h2>
                        <span className="tag">
                          {aiMode === 'ai' ? 'AI 陪伴' : '本地助手'}
                        </span>
                      </div>
                      {chatReply && (
                        <output className="chat-reply">{chatReply}</output>
                      )}
                      <textarea
                        aria-label="告诉助手你的状态"
                        value={chat}
                        maxLength={2000}
                        onChange={(e) => setChat(e.target.value)}
                        placeholder="例如：很累，只想做半小时"
                      />
                      <Button
                        variant="outline"
                        className="mt-3 w-full"
                        disabled={chatBusy || !chat.trim()}
                        onClick={chatSend}
                      >
                        {chatBusy ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Send />
                        )}{' '}
                        说给小晚听
                      </Button>
                    </section>
                  </>
                )}
                {state.goals.length > 0 && (
                  <section className="panel">
                    <div className="section-heading">
                      <h2>正在靠近的目标</h2>
                      <Button
                        variant="ghost"
                        aria-label="查看全部计划"
                        onClick={() => setView('goals')}
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                    {state.goals.slice(0, 3).map((g) => {
                      const ts = state.tasks.filter(
                          (t) => t.goalId === g.id && t.status !== 'cancelled',
                        ),
                        done = ts.filter((t) => t.status === 'done').length;
                      return (
                        <div className="mini-goal" key={g.id}>
                          <h3>{g.title}</h3>
                          <Progress
                            value={ts.length ? (done / ts.length) * 100 : 0}
                            aria-label={`${g.title}完成进度`}
                          />
                          <span className="muted">
                            已确认完成 {done} / {ts.length} 项
                          </span>
                        </div>
                      );
                    })}
                  </section>
                )}
              </aside>
            </div>
          )}
          {view === 'goals' && (
            <div className="form-stack">
              {!state.goals.length ? (
                <div className="panel empty-state">
                  <Target />
                  <h3>从你在意的一件事开始</h3>
                  <p>可以是学习、一个作品，也可以是一直想推进的个人计划。</p>
                  <Button onClick={() => setEditor('new')}>
                    <Plus /> 新建主计划
                  </Button>
                </div>
              ) : (
                state.goals.map((g) => {
                  const tasks = state.tasks.filter((t) => t.goalId === g.id),
                    valid = tasks.filter((t) => t.status !== 'cancelled'),
                    done = valid.filter((t) => t.status === 'done').length;
                  return (
                    <section className="panel goal-card" key={g.id}>
                      <div className="section-heading">
                        <div>
                          <div className="actions">
                            <span
                              className="goal-dot"
                              style={{ background: g.color }}
                            />
                            <h2>{g.title}</h2>
                            <span className="tag">
                              {g.priority === 3
                                ? '高优先级'
                                : g.priority === 2
                                  ? '中优先级'
                                  : '低优先级'}
                            </span>
                          </div>
                          <p className="muted mt-2">{g.outcome}</p>
                        </div>
                        <Button variant="outline" onClick={() => setEditor(g)}>
                          <Pencil /> 编辑计划
                        </Button>
                      </div>
                      <div className="goal-meta">
                        <span>
                          <CalendarDays size={16} />
                          {g.deadline
                            ? g.deadline.replace('T', ' ')
                            : '暂未设置截止时间'}
                        </span>
                        <span>
                          {done}/{valid.length} 项完成 · 还需{' '}
                          {tasks
                            .filter(activeTask)
                            .reduce((n, t) => n + t.remaining, 0)}{' '}
                          分钟
                        </span>
                      </div>
                      <Progress
                        value={valid.length ? (done / valid.length) * 100 : 0}
                        aria-label={`${g.title}已完成任务比例`}
                      />
                      <div className="goal-tasks">
                        {tasks.map((t) => (
                          <div
                            className={`goal-task ${t.status === 'done' ? 'done' : ''}`}
                            key={t.id}
                          >
                            <button
                              className="task-check"
                              aria-label={`更新${t.title}进度`}
                              onClick={() => {
                                if (readState().timer) {
                                  setAppError(
                                    '请先结算当前计时，再手动更新任务。',
                                  );
                                  return;
                                }
                                setManualTask(t);
                              }}
                            >
                              {t.status === 'done' ? (
                                <CheckCircle2 size={20} />
                              ) : (
                                <span />
                              )}
                            </button>
                            <div className="grow">
                              <h3>{t.title}</h3>
                              <p className="muted">
                                {t.outcome || '完成这项工作'}
                                {t.dependsOn.length
                                  ? ` · 前置 ${t.dependsOn.length} 项`
                                  : ''}
                              </p>
                            </div>
                            <span className="tag">
                              {t.status === 'done'
                                ? '已完成'
                                : t.status === 'cancelled'
                                  ? '已取消'
                                  : `${t.remaining} 分钟`}
                            </span>
                            {activeTask(t) && (
                              <Button variant="ghost" onClick={() => start(t)}>
                                <Play /> 专注
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          )}
          {view === 'records' && (
            <RecordsView state={state} onNotice={setNotice} />
          )}{' '}
          {view === 'settings' && (
            <SettingsView state={state} onNotice={setNotice} />
          )}
          {view === 'habits' && (
            <HabitsView
              state={state}
              onNotice={setNotice}
              onSchedule={openCheckin}
            />
          )}
          {view === 'calendar' && (
            <CalendarView state={state} onEdit={setEditor} now={now} />
          )}
        </div>
      </main>
      {feedbackOpen && (
        <FeedbackDialog state={state} onClose={() => setFeedbackOpen(false)} />
      )}
      <NotificationCenter
        state={state}
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onOpenItem={(item) => {
          setNotificationsOpen(false);
          if (item.goalId) {
            const goal = state.goals.find((g) => g.id === item.goalId);
            if (goal) setEditor(goal);
            else setView('calendar');
          } else setView('today');
        }}
      />
      {editor && (
        <GoalEditor
          state={state}
          goal={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={setNotice}
        />
      )}
      <Dialog
        open={checkinOpen}
        onOpenChange={(v) => {
          if (!v) {
            planningRequest.current++;
            setPlanningBusy(false);
          }
          setCheckinOpen(v);
        }}
      >
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>今天就按你的节奏来</DialogTitle>
            <DialogDescription>
              确认可用时段和状态，先看看安排，再决定是否采纳。
            </DialogDescription>
          </DialogHeader>
          <div className="form-grid">
            <Field label="日期">
              <input
                type="date"
                min={draftCheckin.date}
                max={localDate()}
                value={draftCheckin.date}
                onChange={(e) =>
                  setDraftCheckin({ ...draftCheckin, date: e.target.value })
                }
              />
            </Field>
            <Field label="今天的精力">
              <Choice
                label="今日精力"
                value={draftCheckin.energy}
                options={energyOptions}
                onChange={(v) =>
                  setDraftCheckin({ ...draftCheckin, energy: v as Energy })
                }
              />
            </Field>
            <Field label="可以开始的时间">
              <input
                type="time"
                value={draftCheckin.start}
                onChange={(e) =>
                  setDraftCheckin({ ...draftCheckin, start: e.target.value })
                }
              />
            </Field>
            <Field label="最晚结束时间">
              <input
                type="time"
                value={draftCheckin.end}
                onChange={(e) =>
                  setDraftCheckin({ ...draftCheckin, end: e.target.value })
                }
              />
            </Field>
            <Check
              label="结束于次日（跨午夜）"
              checked={draftCheckin.nextDay}
              onChange={(v) => setDraftCheckin({ ...draftCheckin, nextDay: v })}
            />
            <Field label="此刻心情（可跳过）">
              <input
                maxLength={100}
                value={draftCheckin.mood}
                placeholder="用一句话说说也可以"
                onChange={(e) =>
                  setDraftCheckin({ ...draftCheckin, mood: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="section-heading">
            <h3>中间有不能安排任务的时间吗？</h3>
            <Button
              variant="ghost"
              onClick={() =>
                setDraftCheckin((c) => ({
                  ...c,
                  commitments: [
                    ...c.commitments,
                    { id: uid(), title: '', start: c.start, end: c.start },
                  ],
                }))
              }
            >
              <Plus /> 添加
            </Button>
          </div>
          {draftCheckin.commitments.map((c, i) => (
            <div className="commitment-row" key={c.id}>
              <input
                className="text-input"
                aria-label={`固定事务${i + 1}`}
                value={c.title}
                placeholder="吃饭、家务或其他安排"
                onChange={(e) =>
                  setDraftCheckin((d) => ({
                    ...d,
                    commitments: d.commitments.map((x) =>
                      x.id === c.id ? { ...x, title: e.target.value } : x,
                    ),
                  }))
                }
              />
              <input
                aria-label={`事务${i + 1}开始`}
                type="time"
                value={c.start}
                onChange={(e) =>
                  setDraftCheckin((d) => ({
                    ...d,
                    commitments: d.commitments.map((x) =>
                      x.id === c.id ? { ...x, start: e.target.value } : x,
                    ),
                  }))
                }
              />
              <input
                aria-label={`事务${i + 1}结束`}
                type="time"
                value={c.end}
                onChange={(e) =>
                  setDraftCheckin((d) => ({
                    ...d,
                    commitments: d.commitments.map((x) =>
                      x.id === c.id ? { ...x, end: e.target.value } : x,
                    ),
                  }))
                }
              />
              <Button
                variant="ghost"
                aria-label="删除固定事务"
                onClick={() =>
                  setDraftCheckin((d) => ({
                    ...d,
                    commitments: d.commitments.filter((x) => x.id !== c.id),
                  }))
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <p className="field-note">
            会预留 {state.settings.preparation} 分钟准备、
            {state.settings.buffer} 分钟缓冲，以及专注间的休息。
            {state.skipped.date === localDate() && state.skipped.ids.length
              ? ` 今天已延后 ${state.skipped.ids.length} 项。`
              : ''}
          </p>
          {state.skipped.ids.length > 0 && (
            <Button
              variant="ghost"
              onClick={() =>
                safely(async () => {
                  await atomicUpdate((s) => ({
                    ...s,
                    skipped: { date: localDate(), ids: [] },
                  }));
                  setNotice('已恢复今日延后任务，下一次预览会重新考虑。');
                })
              }
            >
              重新考虑今天延后的任务
            </Button>
          )}
          {previewError && (
            <p role="alert" className="alert error">
              {previewError}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              onClick={() => {
                planningRequest.current++;
                setPlanningBusy(false);
                setCheckinOpen(false);
              }}
            >
              取消
            </Button>
            <Button
              disabled={planningBusy}
              onClick={() => buildPreview(draftCheckin)}
            >
              {planningBusy && <LoaderCircle className="animate-spin" />}
              <Sparkles /> 生成安排预览
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {preview && (
        <Dialog open onOpenChange={(v) => !v && setPreview(null)}>
          <DialogContent className="wide-dialog">
            <DialogHeader>
              <DialogTitle>
                {state.plan ? '看看调整后的今晚' : '今晚，可以这样开始'}
              </DialogTitle>
              <DialogDescription>
                这是预览。你可以改时间、移除或锁定任务；采纳后才会更新当前安排和提醒。
              </DialogDescription>
            </DialogHeader>
            <p className="alert success">
              安排{' '}
              {preview.blocks
                .filter((b) => b.type === 'focus')
                .reduce((n, b) => n + duration(b), 0)}{' '}
              分钟任务，并留出休息与缓冲。
              {state.plan
                ? ` 原安排 ${state.plan.blocks.filter((b) => b.type === 'focus').length} 段专注，新安排 ${preview.blocks.filter((b) => b.type === 'focus').length} 段。`
                : ''}
            </p>
            {preview.blocks.map((b) => (
              <div key={b.id} className="preview-block">
                <div className="section-heading">
                  <h3>{b.title}</h3>
                  <span className="tag">
                    {b.done
                      ? '已完成记录'
                      : b.type === 'focus'
                        ? '专注'
                        : b.type === 'break'
                          ? '休息'
                          : b.type === 'buffer'
                            ? '缓冲'
                            : b.type === 'commitment'
                              ? '固定事务'
                              : '准备'}
                  </span>
                </div>
                <div className="preview-times">
                  <input
                    aria-label={`${b.title}开始时间`}
                    type="datetime-local"
                    disabled={b.done || b.locked || b.type === 'commitment'}
                    value={datetime(b.start)}
                    onChange={(e) =>
                      setPreview((p) =>
                        p
                          ? {
                              ...p,
                              blocks: p.blocks.map((x) =>
                                x.id === b.id
                                  ? {
                                      ...x,
                                      start: new Date(e.target.value).getTime(),
                                    }
                                  : x,
                              ),
                            }
                          : p,
                      )
                    }
                  />
                  <span>至</span>
                  <input
                    aria-label={`${b.title}结束时间`}
                    type="datetime-local"
                    disabled={b.done || b.locked || b.type === 'commitment'}
                    value={datetime(b.end)}
                    onChange={(e) =>
                      setPreview((p) =>
                        p
                          ? {
                              ...p,
                              blocks: p.blocks.map((x) =>
                                x.id === b.id
                                  ? {
                                      ...x,
                                      end: new Date(e.target.value).getTime(),
                                    }
                                  : x,
                              ),
                            }
                          : p,
                      )
                    }
                  />
                </div>
                <div className="actions mt-2">
                  <span className="muted grow">{b.reason}</span>
                  {!b.done && b.type === 'focus' && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setPreview((p) =>
                            p
                              ? {
                                  ...p,
                                  blocks: p.blocks.map((x) =>
                                    x.id === b.id
                                      ? { ...x, locked: !x.locked }
                                      : x,
                                  ),
                                }
                              : p,
                          )
                        }
                      >
                        {b.locked ? <LockKeyhole /> : <LockKeyholeOpen />}
                        {b.locked ? '已锁定' : '锁定'}
                      </Button>
                      {!b.locked && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setPreview((p) =>
                              p
                                ? {
                                    ...p,
                                    blocks: p.blocks.filter(
                                      (x) => x.id !== b.id,
                                    ),
                                  }
                                : p,
                            )
                          }
                        >
                          移除
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {preview.notes.map((n, i) => (
              <p className="field-note" key={i}>
                {n}
              </p>
            ))}
            {appError && (
              <p role="alert" className="alert error">
                {appError}
              </p>
            )}
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => setPreview(null)}>
                暂不采纳
              </Button>
              <Button onClick={accept}>
                <CheckCircle2 /> 采纳这个安排
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {timer?.status === 'awaiting' && timer.kind === 'focus' && (
        <Feedback
          key={timer.id}
          task={state.tasks.find((t) => t.id === timer.taskId)!}
          minutes={timer.elapsedMs / MINUTE}
          onConfirm={feedback}
          error={appError}
        />
      )}
      {timer?.status === 'awaiting' && timer.kind === 'break' && (
        <Dialog open>
          <DialogContent className="wide-dialog">
            <DialogHeader>
              <DialogTitle>休息结束，感觉怎么样？</DialogTitle>
              <DialogDescription>
                准备好了再继续，也可以今天就到这里。
              </DialogDescription>
            </DialogHeader>
            <Button
              onClick={() =>
                safely(async () => {
                  await atomicUpdate((s) => ({ ...s, timer: null }));
                })
              }
            >
              回到今天的安排
            </Button>
          </DialogContent>
        </Dialog>
      )}
      {manualTask && (
        <Feedback
          key={manualTask.id}
          task={manualTask}
          minutes={0}
          manual
          onClose={() => setManualTask(null)}
          onConfirm={feedback}
          error={appError}
        />
      )}
      {switchTarget && (
        <Dialog open onOpenChange={(v) => !v && setSwitchTarget(null)}>
          <DialogContent className="wide-dialog">
            <DialogHeader>
              <DialogTitle>先为当前这一段收个尾</DialogTitle>
              <DialogDescription>
                切换前保留实际投入的时间，并确认当前任务的进度。
              </DialogDescription>
            </DialogHeader>
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => setSwitchTarget(null)}>
                继续当前任务
              </Button>
              <Button
                onClick={() =>
                  safely(async () => {
                    const next = switchTarget;
                    setSwitchTarget(null);
                    if (readState().timer?.kind === 'break') {
                      await atomicUpdate((s) => ({ ...s, timer: null }));
                      await start(next.task, next.block, true);
                    } else {
                      setPendingStart(next);
                      await atomicUpdate((s) => settleTimer(s));
                    }
                  })
                }
              >
                结算并切换
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </SidebarProvider>
  );
}

function Feedback({
  task,
  minutes,
  onConfirm,
  onClose,
  manual = false,
  error,
}: {
  task: Task;
  minutes: number;
  onConfirm: (
    taskId: string,
    complete: boolean,
    remaining: number,
    rest: boolean,
    stopToday?: boolean,
  ) => Promise<void>;
  onClose?: () => void;
  manual?: boolean;
  error: string;
}) {
  const [remaining, setRemaining] = useState(
      Math.max(1, (task?.remaining || 25) - Math.floor(minutes)),
    ),
    [rest, setRest] = useState(!manual);
  if (!task) return null;
  return (
    <Dialog open onOpenChange={(v) => !v && manual && onClose?.()}>
      <DialogContent className="wide-dialog" showCloseButton={manual}>
        <DialogHeader>
          <DialogTitle>
            {manual ? '更新这一步的进度' : '这一小段，已经记下了'}
          </DialogTitle>
          <DialogDescription>
            {task.title}
            {!manual
              ? ` · 本轮专注 ${Math.floor(minutes)} 分 ${Math.round((minutes % 1) * 60)} 秒`
              : ''}
            。计时结束不会自动完成任务。
          </DialogDescription>
        </DialogHeader>
        <Field
          label="如果还没做完，预计还需要多少分钟？"
          note="这是待确认估计，请按实际进展修正。"
        >
          <input
            type="number"
            min={1}
            max={10000}
            value={remaining}
            onChange={(e) => setRemaining(Number(e.target.value))}
          />
        </Field>
        {!manual && (
          <Check label="反馈后开始休息" checked={rest} onChange={setRest} />
        )}
        <div className="actions">
          <Button onClick={() => onConfirm(task.id, true, 0, rest)}>
            <CheckCircle2 /> 任务完成
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(task.id, false, remaining, rest)}
          >
            还需继续
          </Button>
          <Button
            variant="ghost"
            onClick={() => onConfirm(task.id, false, remaining, false, true)}
          >
            今天先到这里
          </Button>
        </div>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
