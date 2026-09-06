'use client';
import { useState } from 'react';
import { Plus, Sparkles, Trash2, GitMerge, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Choice, Check, energyOptions, statusOptions } from './controls';
import { activeTask, uid } from '@/lib/model';
import type { AppState, Goal, Task, Energy, TaskStatus } from '@/lib/model';
import { validateTasks } from '@/lib/scheduler';
import { localDecompose, validateDraftTasks } from '@/lib/agent';
import { atomicUpdate } from '@/lib/store';

export function GoalEditor({
  state,
  goal,
  onClose,
  onSaved,
}: {
  state: AppState;
  goal?: Goal;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Goal>(
    goal
      ? { ...goal }
      : {
          id: uid(),
          title: '',
          outcome: '',
          deadline: '',
          priority: 2,
          color: '#4f67a4',
        },
  );
  const [tasks, setTasks] = useState<Task[]>(
    goal
      ? state.tasks
          .filter((t) => t.goalId === goal.id)
          .map((t) => ({ ...t, dependsOn: [...t.dependsOn] }))
      : [],
  );
  const [source, setSource] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [selected, setSelected] = useState<string[]>([]);
  const change = (id: string, patch: Partial<Task>) =>
    setTasks((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const add = () =>
    setTasks((all) => [
      ...all,
      {
        id: uid(),
        goalId: draft.id,
        title: '',
        outcome: '',
        estimate: 25,
        remaining: 25,
        energy: 'medium',
        splittable: true,
        dependsOn: [],
        fixedStart: '',
        status: 'todo',
      },
    ]);
  async function split(local = false) {
    setError('');
    if (!draft.title.trim()) {
      setError('先给目标起个名字。');
      return;
    }
    setBusy(true);
    try {
      let data: { tasks?: unknown; message?: string; error?: string };
      if (local)
        data = {
          tasks: localDecompose(draft.title, draft.outcome, source),
          message: '本地拆分草稿，预计时长请自行确认。',
        };
      else {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'decompose',
            title: draft.title,
            outcome: draft.outcome,
            source,
          }),
        });
        data = (await res.json()) as {
          tasks?: unknown;
          message?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error);
      }
      const parsed = validateDraftTasks(data.tasks),
        ids = parsed.map(() => uid());
      setTasks((all) => [
        ...all,
        ...parsed.map((t, i) => ({
          id: ids[i],
          goalId: draft.id,
          title: t.title,
          outcome: t.outcome,
          estimate: t.minutes,
          remaining: t.minutes,
          energy: t.energy,
          splittable: true,
          dependsOn: t.dependsOn.map((d) => ids[d]),
          fixedStart: '',
          status: 'todo' as const,
        })),
      ]);
      setMessage(data.message || '请确认拆分结果。');
    } catch (e) {
      setError((e as Error).message || '生成失败，可使用本地拆分。');
    } finally {
      setBusy(false);
    }
  }
  function merge() {
    const chosen = tasks.filter((t) => selected.includes(t.id));
    if (chosen.length < 2) return;
    const keep = chosen[0];
    const merged: Task = {
      ...keep,
      title: chosen.map((t) => t.title).join(' + '),
      outcome: chosen.map((t) => t.outcome).join('；'),
      estimate: chosen.reduce((n, t) => n + t.estimate, 0),
      remaining: chosen.reduce((n, t) => n + t.remaining, 0),
      dependsOn: [
        ...new Set(
          chosen
            .flatMap((t) => t.dependsOn)
            .filter((id) => !selected.includes(id)),
        ),
      ],
    };
    setTasks((all) =>
      all
        .filter((t) => !selected.includes(t.id) || t.id === keep.id)
        .map((t) =>
          t.id === keep.id
            ? merged
            : {
                ...t,
                dependsOn: [
                  ...new Set(
                    t.dependsOn.map((id) =>
                      selected.includes(id) ? keep.id : id,
                    ),
                  ),
                ],
              },
        ),
    );
    setSelected([]);
  }
  async function save() {
    setError('');
    try {
      if (!draft.title.trim() || !draft.outcome.trim())
        throw new Error('请填写目标名称与完成标准。');
      if (!tasks.length) throw new Error('至少添加一个子任务。');
      if (
        draft.deadline &&
        !Number.isFinite(new Date(draft.deadline).getTime())
      )
        throw new Error('截止时间无效。');
      const clean = tasks.map((t) => ({
        ...t,
        title: t.title.trim(),
        remaining: t.status === 'done' ? 0 : t.remaining,
      }));
      await atomicUpdate((current) => {
        if (
          current.timer &&
          current.tasks.find((t) => t.id === current.timer?.taskId)?.goalId ===
            draft.id
        )
          throw new Error('请先结算该目标正在计时的任务。');
        const all = [
          ...current.tasks.filter((t) => t.goalId !== draft.id),
          ...clean,
        ];
        const errors = validateTasks(all);
        if (errors.length) throw new Error(errors[0]);
        const changedIds = new Set([
          ...current.tasks
            .filter((t) => t.goalId === draft.id)
            .map((t) => t.id),
          ...clean.map((t) => t.id),
        ]);
        const plan = current.plan
          ? {
              ...current.plan,
              blocks: current.plan.blocks.filter(
                (b) => b.done || !b.taskId || !changedIds.has(b.taskId),
              ),
              notes: [
                ...current.plan.notes,
                '目标内容已更新，请重新安排剩余任务。',
              ],
            }
          : null;
        return {
          ...current,
          goals: [
            ...current.goals.filter((g) => g.id !== draft.id),
            { ...draft, title: draft.title.trim() },
          ],
          tasks: all,
          plan,
          previousPlan: null,
        };
      });
      onSaved('计划已保存，可以安排今晚了。');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="wide-dialog goal-dialog">
        <DialogHeader>
          <DialogTitle>
            {goal ? '编辑主计划' : '让一个目标，变成具体的小步'}
          </DialogTitle>
          <DialogDescription>
            先说清楚想完成什么，再确认每一步。时间估计随时可以调整。
          </DialogDescription>
        </DialogHeader>
        <div className="form-grid">
          <Field label="目标名称">
            <input
              maxLength={160}
              placeholder="例如：完成个人作品集"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          <Field label="优先级">
            <Choice
              label="目标优先级"
              value={String(draft.priority)}
              onChange={(v) => setDraft({ ...draft, priority: Number(v) })}
              options={[
                { value: '3', label: '高 · 优先推进' },
                { value: '2', label: '中 · 稳步进行' },
                { value: '1', label: '低 · 有空再做' },
              ]}
            />
          </Field>
          <Field label="完成标准" className="span-2">
            <input
              maxLength={500}
              placeholder="例如：三个案例完成文案和排版"
              value={draft.outcome}
              onChange={(e) => setDraft({ ...draft, outcome: e.target.value })}
            />
          </Field>
          <Field
            label="截止时间（可不填）"
            note={`使用当前设备时区：${new Intl.DateTimeFormat().resolvedOptions().timeZone}`}
          >
            <input
              type="datetime-local"
              value={draft.deadline}
              onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
            />
          </Field>
        </div>
        <div className="split-area">
          <Field
            label="已有主计划？粘贴在这里"
            note="每行一项，可写预计分钟数。生成内容会加入下方草稿，保存后才生效。"
          >
            <textarea
              maxLength={12000}
              placeholder={
                '整理项目截图 25分钟\n写项目介绍 50分钟\n检查排版 25分钟'
              }
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </Field>
          <div className="actions mt-3">
            <Button disabled={busy} onClick={() => split()}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{' '}
              拆成可执行步骤
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => split(true)}>
              本地拆分
            </Button>
          </div>
        </div>
        {message && <p className="alert success">{message}</p>}
        <div className="section-heading">
          <h2>子任务 · {tasks.length}</h2>
          <div className="actions">
            <Button
              variant="ghost"
              disabled={selected.length < 2}
              onClick={merge}
            >
              <GitMerge /> 合并所选
            </Button>
            <Button variant="outline" onClick={add}>
              <Plus /> 添加
            </Button>
          </div>
        </div>
        <div className="task-drafts">
          {tasks.map((t, i) => (
            <div className="task-draft" key={t.id}>
              <div className="task-draft-title">
                <Check
                  label={`${i + 1}`}
                  checked={selected.includes(t.id)}
                  onChange={(checked) =>
                    setSelected((v) =>
                      checked ? [...v, t.id] : v.filter((id) => id !== t.id),
                    )
                  }
                />
                <input
                  aria-label={`任务${i + 1}名称`}
                  placeholder="具体要做的事情"
                  value={t.title}
                  onChange={(e) => change(t.id, { title: e.target.value })}
                />
                <Button
                  variant="ghost"
                  aria-label={`删除任务${i + 1}`}
                  onClick={() => {
                    if (tasks.some((other) => other.dependsOn.includes(t.id))) {
                      setError('请先移除其他任务对它的依赖。');
                      return;
                    }
                    setTasks(tasks.filter((x) => x.id !== t.id));
                  }}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <div className="form-grid">
                <Field label="完成标准">
                  <input
                    value={t.outcome}
                    placeholder="怎样算完成"
                    onChange={(e) => change(t.id, { outcome: e.target.value })}
                  />
                </Field>
                <Field label="预计剩余分钟">
                  <input
                    type="number"
                    min={activeTask(t) ? 1 : 0}
                    max={10000}
                    value={t.remaining}
                    onChange={(e) =>
                      change(t.id, {
                        remaining: Number(e.target.value),
                        estimate: Math.max(t.estimate, Number(e.target.value)),
                      })
                    }
                  />
                </Field>
                <Field label="精力要求">
                  <Choice
                    label={`任务${i + 1}精力`}
                    value={t.energy}
                    onChange={(v) => change(t.id, { energy: v as Energy })}
                    options={energyOptions}
                  />
                </Field>
                <Field label="任务状态">
                  <Choice
                    label={`任务${i + 1}状态`}
                    value={t.status}
                    onChange={(v) =>
                      change(t.id, {
                        status: v as TaskStatus,
                        remaining: v === 'done' ? 0 : t.remaining || t.estimate,
                      })
                    }
                    options={statusOptions}
                  />
                </Field>
                <Field label="固定开始时间（可不填）">
                  <input
                    type="time"
                    value={t.fixedStart}
                    onChange={(e) =>
                      change(t.id, { fixedStart: e.target.value })
                    }
                  />
                </Field>
                <div className="field justify-center">
                  <Check
                    label="允许分次完成"
                    checked={t.splittable}
                    onChange={(v) => change(t.id, { splittable: v })}
                  />
                </div>
              </div>
              <details>
                <summary>前置任务（已选 {t.dependsOn.length} 项）</summary>
                <div className="dependency-list">
                  {[
                    ...state.tasks.filter(
                      (x) => x.goalId !== draft.id && !x.habitId,
                    ),
                    ...tasks,
                  ]
                    .filter((x) => x.id !== t.id)
                    .map((dep) => (
                      <Check
                        key={dep.id}
                        label={dep.title || '未命名任务'}
                        checked={t.dependsOn.includes(dep.id)}
                        onChange={(checked) =>
                          change(t.id, {
                            dependsOn: checked
                              ? [...t.dependsOn, dep.id]
                              : t.dependsOn.filter((id) => id !== dep.id),
                          })
                        }
                      />
                    ))}
                </div>
              </details>
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={save}>确认并保存计划</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
