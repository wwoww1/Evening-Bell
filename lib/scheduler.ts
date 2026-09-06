import { MINUTE, uid, at, addDays, activeTask, localDate } from './model.ts';
import type { AppState, Block, Checkin, Plan, Task } from './model.ts';
import {
  materializeHabits,
  tasksForDay,
  habitBudget,
  habitSignature,
} from './habits.ts';
export interface PlanningAdvice {
  orderedTaskIds: string[];
  reasons: Record<string, string>;
}

export function validateTasks(tasks: Task[]): string[] {
  const errors: string[] = [],
    map = new Map(tasks.map((t) => [t.id, t]));
  const visit = (id: string, path: Set<string>, seen: Set<string>) => {
    if (path.has(id)) {
      errors.push('任务存在循环依赖，请先修改前置任务。');
      return;
    }
    if (seen.has(id)) return;
    const t = map.get(id);
    if (!t) return;
    path.add(id);
    for (const dep of t.dependsOn) {
      if (!map.has(dep)) errors.push(`「${t.title}」的前置任务不存在。`);
      else visit(dep, path, seen);
    }
    path.delete(id);
    seen.add(id);
  };
  for (const t of tasks) {
    if (!t.title.trim()) errors.push('任务名称不能为空。');
    if (
      !Number.isFinite(t.remaining) ||
      t.remaining < 0 ||
      (activeTask(t) && t.remaining === 0)
    )
      errors.push(`「${t.title}」需要有效的剩余时长。`);
    if (!Number.isFinite(t.estimate) || t.estimate <= 0)
      errors.push('预计时长必须大于 0。');
    visit(t.id, new Set(), new Set());
  }
  return [...new Set(errors)];
}
export function windowFor(c: Checkin): [number, number] {
  const start = at(c.date, c.start),
    end = at(c.nextDay ? addDays(c.date, 1) : c.date, c.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 24 * 60 * MINUTE
  )
    throw new Error('请检查开始和结束时间；跨午夜时请勾选“结束于次日”。');
  return [start, end];
}
export function clockInWindow(c: Checkin, time: string): number {
  return at(c.nextDay && time < c.start ? addDays(c.date, 1) : c.date, time);
}
function commitmentWindow(
  c: Checkin,
  start: string,
  end: string,
): [number, number] {
  const [windowStart, windowEnd] = windowFor(c);
  const candidates = [-1, 0, 1].map((offset): [number, number] => {
    const date = addDays(c.date, offset);
    return [at(date, start), at(end < start ? addDays(date, 1) : date, end)];
  });
  const intersection = ([a, b]: [number, number]) =>
    Math.max(0, Math.min(b, windowEnd) - Math.max(a, windowStart));
  return candidates.sort((a, b) => intersection(b) - intersection(a))[0];
}
const overlaps = (a: Block, b: Block) => a.start < b.end && b.start < a.end;
const make = (
  type: Block['type'],
  title: string,
  start: number,
  end: number,
  reason = '',
  taskId?: string,
): Block => ({
  id: uid(),
  type,
  title,
  start,
  end,
  reason,
  taskId,
  locked: false,
  done: false,
});
function gaps(
  start: number,
  end: number,
  occupied: Block[],
): [number, number][] {
  const out: [number, number][] = [];
  let cursor = start;
  for (const b of occupied
    .filter((b) => b.end > start && b.start < end)
    .sort((a, b) => a.start - b.start)) {
    if (b.start > cursor) out.push([cursor, Math.min(end, b.start)]);
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
}
export function validatePlan(plan: Plan, tasks: Task[]): string[] {
  const errors: string[] = [],
    [start, end] = windowFor(plan.checkin);
  const blocks = [...plan.blocks].sort((a, b) => a.start - b.start);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (
      !Number.isFinite(b.start) ||
      !Number.isFinite(b.end) ||
      b.end <= b.start
    )
      errors.push('时间块必须具有有效时长。');
    if (!b.done && (b.start < start || b.end > end))
      errors.push(`「${b.title}」超出可用时段。`);
    if (i && overlaps(blocks[i - 1], b))
      errors.push(`「${b.title}」与其他安排重叠。`);
    if (b.type === 'focus' && !b.done) {
      const t = taskMap.get(b.taskId || '');
      if (!t || !activeTask(t))
        errors.push(`「${b.title}」已经完成、取消或不存在。`);
      else {
        if (
          !t.splittable &&
          Math.round((b.end - b.start) / MINUTE) < t.remaining
        )
          errors.push(`「${t.title}」不可拆分。`);
        if (
          t.fixedStart &&
          b.start !== clockInWindow(plan.checkin, t.fixedStart)
        )
          errors.push(`「${t.title}」必须保留固定开始时间。`);
        for (const dep of t.dependsOn) {
          const dt = taskMap.get(dep);
          if (dt?.status === 'done') continue;
          const earlier = blocks.filter(
            (x) => x.taskId === dep && !x.done && x.end <= b.start,
          );
          const covered = earlier.reduce(
            (sum, x) => sum + (x.end - x.start) / MINUTE,
            0,
          );
          if (!dt || dt.status === 'cancelled' || covered < (dt.remaining || 1))
            errors.push(`「${t.title}」的前置任务尚未安排完成。`);
        }
      }
    }
  }
  for (const t of tasks) {
    const planned = blocks
      .filter((b) => b.taskId === t.id && !b.done)
      .reduce((sum, b) => sum + (b.end - b.start) / MINUTE, 0);
    if (planned > t.remaining + 0.01)
      errors.push(
        `「${t.title}」的安排超过剩余工作量，请修改预计时长或时间块。`,
      );
  }
  return [...new Set(errors)];
}

export function generatePlan(
  state: AppState,
  checkin: Checkin,
  now = Date.now(),
  advice?: PlanningAdvice,
): Plan {
  state = materializeHabits(state, checkin.date);
  state = { ...state, tasks: tasksForDay(state, checkin.date) };
  const invalid = validateTasks(state.tasks);
  if (invalid.length) throw new Error(invalid[0]);
  const [begin, end] = windowFor(checkin),
    start = Math.max(begin, now),
    s = state.settings;
  if (state.timer)
    throw new Error('请先暂停后结束当前计时并反馈进度，再重新安排。');
  const sameDay = state.plan?.date === checkin.date;
  const preserved = sameDay
    ? state.plan!.blocks.filter((b) => b.done || b.locked)
    : [];
  const blocks: Block[] = preserved.map((b) => ({ ...b }));
  const notes: string[] = [];
  for (const b of blocks) {
    if (!b.done && (b.start < start || b.end > end))
      throw new Error(`锁定的「${b.title}」与新时段冲突，请先解锁或调整时间。`);
  }
  for (const c of checkin.commitments) {
    const [cs, ce] = commitmentWindow(checkin, c.start, c.end);
    if (ce <= cs || !Number.isFinite(cs))
      throw new Error('固定事务的结束时间必须晚于开始时间。');
    if (ce > start && cs < end)
      blocks.push(
        make(
          'commitment',
          c.title || '固定事务',
          Math.max(cs, start),
          Math.min(ce, end),
          '已预留的个人事务',
        ),
      );
  }
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++)
    if (overlaps(sorted[i - 1], sorted[i]))
      throw new Error('锁定事项与固定事务发生冲突，请调整后再生成。');
  const goalMap = new Map(state.goals.map((g) => [g.id, g]));
  const skipped = new Set(
    state.skipped.date === checkin.date ? state.skipped.ids : [],
  );
  const remaining = new Map(
    state.tasks.filter(activeTask).map((t) => [t.id, t.remaining]),
  );
  for (const b of preserved)
    if (b.taskId && !b.done)
      remaining.set(
        b.taskId,
        Math.max(
          0,
          (remaining.get(b.taskId) || 0) - (b.end - b.start) / MINUTE,
        ),
      );
  const completion = new Map(
    state.tasks
      .filter((t) => t.status === 'done')
      .map((t) => [t.id, -Infinity]),
  );
  for (const [id, rem] of remaining)
    if (rem === 0)
      completion.set(
        id,
        Math.max(...blocks.filter((b) => b.taskId === id).map((b) => b.end)),
      );
  const fixed = state.tasks.filter(
    (t) =>
      activeTask(t) &&
      t.fixedStart &&
      !skipped.has(t.id) &&
      !preserved.some((b) => b.taskId === t.id),
  );
  for (const t of fixed) {
    const ts = clockInWindow(checkin, t.fixedStart),
      te = ts + t.remaining * MINUTE;
    const b = make('focus', t.title, ts, te, '按你设置的固定时段安排', t.id);
    if (ts < start || te > end) {
      notes.push(`「${t.title}」的固定时段不在本次可用窗口内。`);
      continue;
    }
    if (blocks.some((x) => overlaps(x, b))) {
      notes.push(`「${t.title}」的固定时段有冲突，本次未安排。`);
      continue;
    }
    blocks.push(b);
    remaining.set(t.id, 0);
    completion.set(t.id, te);
  }
  for (const hard of [...blocks].filter((b) => b.type === 'focus' && !b.done)) {
    const next = blocks
      .filter((b) => b.start >= hard.end && b.id !== hard.id)
      .sort((a, b) => a.start - b.start)[0];
    if (next?.start === hard.end && next.type === 'focus' && s.breakMinutes > 0)
      throw new Error('固定或锁定的专注安排之间没有休息时间，请调整时间块。');
    const stop = Math.min(
      end,
      next?.start ?? end,
      hard.end + s.breakMinutes * MINUTE,
    );
    if (stop > hard.end)
      blocks.push(
        make('break', '固定任务后的休息', hard.end, stop, '为固定安排预留休息'),
      );
  }
  let free = gaps(start, end, blocks);
  if (free.length && s.preparation > 0) {
    const [a, b] = free[0];
    blocks.push(
      make(
        'preparation',
        '先休息，慢慢进入状态',
        a,
        Math.min(b, a + s.preparation * MINUTE),
        '给自己一点过渡时间',
      ),
    );
  }
  free = gaps(start, end, blocks);
  if (free.length && s.buffer > 0) {
    const [a, b] = free[free.length - 1];
    blocks.push(
      make(
        'buffer',
        '留白与收尾',
        Math.max(a, b - s.buffer * MINUTE),
        b,
        '给临时变化留出空间',
      ),
    );
  }
  const urgentPrerequisites = new Set<string>();
  const markPrerequisites = (id: string) => {
    const task = state.tasks.find((t) => t.id === id);
    for (const dep of task?.dependsOn || [])
      if (!urgentPrerequisites.has(dep)) {
        urgentPrerequisites.add(dep);
        markPrerequisites(dep);
      }
  };
  for (const hard of blocks.filter((b) => b.type === 'focus' && !b.done))
    if (hard.taskId) markPrerequisites(hard.taskId);
  const score = (t: Task) => {
    const goal = goalMap.get(t.goalId);
    const habit = t.habitId
      ? state.habits.find((h) => h.id === t.habitId)
      : undefined;
    const adviceIndex = advice?.orderedTaskIds.indexOf(t.id) ?? -1;
    const deadline = goal?.deadline
      ? new Date(goal.deadline).getTime()
      : Infinity;
    const days = (deadline - start) / (24 * 60 * MINUTE);
    return (
      (urgentPrerequisites.has(t.id) ? 10000 : 0) +
      (goal?.priority || habit?.priority || 1) * 30 +
      (habit ? 20 : 0) +
      (adviceIndex >= 0 ? Math.max(0, 40 - adviceIndex * 2) : 0) +
      (days <= 0 ? 300 : days < 3 ? 180 : days < 7 ? 100 : days < 15 ? 40 : 0) +
      Math.min(t.remaining, 120) / 4 +
      (t.energy === checkin.energy ? 20 : 0) -
      (checkin.energy === 'low' && t.energy === 'high' ? 50 : 0)
    );
  };
  let count = 0;
  for (const [a, b] of gaps(start, end, blocks)) {
    let cursor = a;
    while (cursor + MINUTE <= b) {
      const available = (b - cursor) / MINUTE;
      const candidates = state.tasks
        .filter(
          (t) =>
            activeTask(t) &&
            !t.fixedStart &&
            !skipped.has(t.id) &&
            (remaining.get(t.id) || 0) > 0 &&
            t.dependsOn.every(
              (d) => (completion.get(d) ?? Infinity) <= cursor,
            ) &&
            (t.splittable || t.remaining <= available),
        )
        .sort((x, y) => score(y) - score(x) || x.id.localeCompare(y.id));
      if (!candidates.length) break;
      const task = candidates[0],
        rem = remaining.get(task.id)!;
      const slice = task.splittable
        ? Math.min(rem, s.focusMinutes, available)
        : rem;
      const goal = goalMap.get(task.goalId);
      const reason = `${task.habitId ? '每日习惯 · ' : ''}${goal?.priority === 3 ? '优先目标 · ' : ''}${task.energy === checkin.energy ? '适合当前精力 · ' : ''}${advice?.reasons[task.id] || (task.dependsOn.length ? '在前置任务之后推进' : '从可执行的一步开始')}`;
      blocks.push(
        make(
          'focus',
          task.title,
          cursor,
          cursor + slice * MINUTE,
          reason,
          task.id,
        ),
      );
      cursor += slice * MINUTE;
      remaining.set(task.id, rem - slice);
      if (rem - slice <= 0) completion.set(task.id, cursor);
      count++;
      if (cursor < b) {
        const rest = count % 4 === 0 ? s.longBreakMinutes : s.breakMinutes;
        if (rest > 0) {
          const restEnd = Math.min(b, cursor + rest * MINUTE);
          blocks.push(
            make(
              'break',
              count % 4 === 0 ? '长休息，给自己充个电' : '休息一下',
              cursor,
              restEnd,
              '离开屏幕，活动一下',
            ),
          );
          cursor = restEnd;
        }
      }
    }
  }
  // A fixed task may be infeasible. Keep the useful plan and explain the omission.
  const infeasibleFixed = fixed.filter(
    (t) =>
      blocks.some((b) => b.taskId === t.id) &&
      t.dependsOn.some((dep) => {
        if (state.tasks.find((x) => x.id === dep)?.status === 'done')
          return false;
        return (
          (completion.get(dep) ?? Infinity) >
          clockInWindow(checkin, t.fixedStart)
        );
      }),
  );
  if (infeasibleFixed.length) {
    const retry = generatePlan(
      {
        ...state,
        skipped: {
          date: checkin.date,
          ids: [...skipped, ...infeasibleFixed.map((t) => t.id)],
        },
      },
      checkin,
      now,
      advice,
    );
    retry.notes.unshift(
      ...infeasibleFixed.map(
        (t) =>
          `「${t.title}」的前置任务无法在固定时段前完成，本次未安排；请调整固定时间或先推进前置任务。`,
      ),
    );
    return retry;
  }
  const plan: Plan = {
    id: uid(),
    date: checkin.date,
    checkin,
    blocks: blocks.sort((a, b) => a.start - b.start),
    notes,
    generatedAt: now,
    habitSignature: habitSignature(state, checkin.date),
    habitTasks: state.tasks.filter(
      (t) => t.habitId && t.habitDate === checkin.date,
    ),
    planningMode: advice ? 'ai' : 'local',
  };
  const errors = validatePlan(plan, state.tasks);
  if (errors.length) throw new Error(errors[0]);
  for (const t of state.tasks.filter(activeTask)) {
    if (skipped.has(t.id)) continue;
    if (!blocks.some((b) => b.taskId === t.id))
      notes.push(
        `「${t.title}」留待后续：${t.dependsOn.some((d) => !completion.has(d)) ? '前置任务尚未完成' : !t.splittable ? '没有足够的连续时间' : '本次时间有限'}。`,
      );
  }
  if (end <= start)
    notes.push('今天没有可用时间，可以安心休息。目标仍会保留。');
  if (checkin.energy === 'low')
    notes.unshift('今天按较轻的节奏安排，你也可以选择提前结束。');
  return plan;
}

export interface Risk {
  deadline: string;
  demand: number;
  capacity: number | null;
  gap: number | null;
  label: string;
  goals: string[];
}
export function capacityRisks(
  state: AppState,
  checkin = state.checkin,
  now = Date.now(),
): Risk[] {
  const dates = [
    ...new Set(
      state.goals
        .filter(
          (g) =>
            g.deadline &&
            state.tasks.some((t) => t.goalId === g.id && activeTask(t)),
        )
        .map((g) => g.deadline),
    ),
  ].sort();
  const [begin, end] = windowFor(checkin);
  return dates.map((deadline) => {
    const cutoff = new Date(deadline).getTime();
    const dueGoals = state.goals.filter(
      (g) => g.deadline && new Date(g.deadline).getTime() <= cutoff,
    );
    const ids = new Set(dueGoals.map((g) => g.id));
    const demand = state.tasks
      .filter((t) => ids.has(t.goalId) && activeTask(t))
      .reduce((n, t) => n + t.remaining, 0);
    let minutes = 0;
    const s = state.settings;
    let unknown = false;
    const focusCapacity = (gross: number) => {
      let available = Math.max(0, gross - s.preparation - s.buffer),
        focus = 0,
        round = 0;
      while (available > 0) {
        const chunk = Math.min(available, Math.max(1, s.focusMinutes));
        focus += chunk;
        available -= chunk;
        round++;
        available -= round % 4 === 0 ? s.longBreakMinutes : s.breakMinutes;
      }
      return focus;
    };
    if (cutoff > Math.max(begin, now)) {
      let gross = Math.max(
        0,
        (Math.min(end, cutoff) - Math.max(begin, now)) / MINUTE,
      );
      for (const c of checkin.commitments) {
        const [cs, ce] = commitmentWindow(checkin, c.start, c.end);
        gross -= Math.max(
          0,
          (Math.min(ce, end, cutoff) - Math.max(cs, begin, now)) / MINUTE,
        );
      }
      minutes += Math.max(
        0,
        focusCapacity(gross) - habitBudget(state, checkin.date),
      );
    }
    const today = localDate(new Date(now));
    let d = addDays(today, 1),
      iterations = 0;
    while (at(d, '00:00') < cutoff && iterations++ < 366) {
      if (!s.futureKnown) {
        unknown = true;
        break;
      }
      if (s.usualDays.includes(new Date(`${d}T12:00:00`).getDay())) {
        const a = at(d, s.usualStart),
          b = at(s.usualEnd < s.usualStart ? addDays(d, 1) : d, s.usualEnd);
        minutes += Math.max(
          0,
          focusCapacity(Math.max(0, (Math.min(b, cutoff) - a) / MINUTE)) -
            habitBudget(state, d),
        );
      }
      d = addDays(d, 1);
    }
    if (iterations >= 366) unknown = true;
    const capacity = unknown ? null : Math.floor(minutes);
    return {
      deadline,
      demand,
      capacity,
      gap: capacity === null ? null : Math.max(0, demand - capacity),
      label: unknown
        ? '未来可用时间未确认，暂无法判断'
        : cutoff <= now
          ? '截止时间已过'
          : `按${s.futureKnown ? '通常时段' : '今日时段'}估算，共享时间预算${state.habits?.length ? '，已为启用习惯预留时长' : ''}`,
      goals: dueGoals.map((g) => g.title),
    };
  });
}

export function parseCheckin(
  text: string,
  current: Checkin,
): { checkin: Checkin; reply: string } {
  const next = structuredClone(current);
  const delay = text.match(
    /(?:晚|推迟|延后)\s*(半小时|一小时|\d+\s*(?:分钟|小时))/,
  );
  if (delay) {
    const value = delay[1],
      minutes =
        value === '半小时'
          ? 30
          : value === '一小时'
            ? 60
            : parseInt(value) * (value.includes('小时') ? 60 : 1);
    const start = at(next.date, next.start) + minutes * MINUTE;
    next.date = localDate(new Date(start));
    next.start = new Date(start).toTimeString().slice(0, 5);
  }
  if (/累|疲惫|没精神/.test(text)) next.energy = 'low';
  if (/精力充沛|状态很好/.test(text)) next.energy = 'high';
  const only = text.match(
    /(?:只想做|只能做|只有|可用)\s*(半小时|一小时|\d+\s*(?:分钟|小时))/,
  );
  if (only) {
    const v = only[1],
      mins =
        v === '半小时'
          ? 30
          : v === '一小时'
            ? 60
            : parseInt(v) * (v.includes('小时') ? 60 : 1);
    const end = at(next.date, next.start) + mins * MINUTE;
    next.end = new Date(end).toTimeString().slice(0, 5);
    next.nextDay = localDate(new Date(end)) !== next.date;
  }
  if (/今天不做|今天休息/.test(text)) {
    next.end = next.start;
    next.nextDay = false;
  }
  windowFor(next);
  return {
    checkin: next,
    reply:
      JSON.stringify(next) !== JSON.stringify(current)
        ? '已调整时间和状态，请检查后预览新安排。'
        : '可以直接修改时间，或说“晚半小时开始”“很累，只想做半小时”“今天休息”。',
  };
}
