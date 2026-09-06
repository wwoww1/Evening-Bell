'use client';
import { useState } from 'react';
import {
  Plus,
  Repeat2,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Field, Choice, Check, energyOptions } from './controls';
import { atomicUpdate } from '@/lib/store';
import { uid, localDate } from '@/lib/model';
import type { AppState, Habit, Energy } from '@/lib/model';
import {
  habitTaskId,
  isHabitDay,
  materializeHabits,
  saveHabit,
  removeHabit,
} from '@/lib/habits';
import { currentPlan, recordProgress } from '@/lib/actions';

const emptyHabit = (): Habit => ({
  id: uid(),
  title: '',
  minutes: 30,
  energy: 'medium',
  priority: 2,
  days: [0, 1, 2, 3, 4, 5, 6],
  enabled: true,
  splittable: false,
});
export function HabitsView({
  state,
  onNotice,
  onSchedule,
}: {
  state: AppState;
  onNotice: (text: string) => void;
  onSchedule: () => void;
}) {
  const [draft, setDraft] = useState<Habit | null>(null),
    [remove, setRemove] = useState<Habit | null>(null),
    [error, setError] = useState('');
  const date = currentPlan(state)?.date || localDate();
  async function update(
    action: (state: AppState) => AppState,
    message: string,
  ) {
    setError('');
    try {
      await atomicUpdate(action);
      onNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  return (
    <div className="form-stack">
      <div className="habit-intro panel">
        <div>
          <h2>每天想为自己做的事</h2>
          <p className="muted">
            不需要截止日期。小晚会在安排今晚时，一并考虑当天的习惯。
          </p>
        </div>
        <div className="actions">
          <Button variant="outline" onClick={onSchedule}>
            加入今晚的安排
          </Button>
          <Button
            onClick={() => {
              setError('');
              setDraft(emptyHabit());
            }}
          >
            <Plus /> 新建习惯
          </Button>
        </div>
      </div>
      {error && !draft && !remove && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!state.habits.length ? (
        <div className="panel empty-state">
          <Repeat2 />
          <h3>从一个愿意重复的小习惯开始</h3>
          <p>例如每天锻炼 30 分钟、睡前阅读 15 分钟。</p>
          <Button onClick={() => setDraft(emptyHabit())}>
            <Plus /> 添加第一个习惯
          </Button>
        </div>
      ) : (
        <div className="habit-grid">
          {state.habits.map((h) => {
            const task = state.tasks.find(
                (t) => t.id === habitTaskId(h.id, date),
              ),
              done = task?.status === 'done',
              scheduled = isHabitDay(h, date),
              skipped =
                state.skipped.date === date &&
                state.skipped.ids.includes(habitTaskId(h.id, date));
            return (
              <section
                key={h.id}
                className={`panel habit-card ${!h.enabled ? 'habit-paused' : ''}`}
              >
                <div className="section-heading">
                  <span className="habit-icon">
                    <Repeat2 size={21} />
                  </span>
                  <Switch
                    aria-label={`启用${h.title}`}
                    checked={h.enabled}
                    onCheckedChange={(v) =>
                      void update(
                        (s) => saveHabit(s, { ...h, enabled: v }),
                        v
                          ? '习惯已启用，下次排程会纳入。'
                          : '习惯已暂停，历史记录保留。',
                      )
                    }
                  />
                </div>
                <h2>{h.title}</h2>
                <div className="habit-meta">
                  <span>
                    <Clock3 size={15} />
                    {h.minutes} 分钟
                  </span>
                  <span>
                    {h.days.length === 7
                      ? '每天'
                      : h.days
                          .map(
                            (d) =>
                              '周' +
                              ['日', '一', '二', '三', '四', '五', '六'][d],
                          )
                          .join('、')}
                  </span>
                </div>
                <p className="muted">
                  {done
                    ? '今天已完成'
                    : !h.enabled
                      ? '已暂停'
                      : !scheduled
                        ? '今天休息'
                        : skipped
                          ? '今天已延后'
                          : '今天待安排'}{' '}
                  · {h.splittable ? '可以分次完成' : '安排一段完整时间'}
                </p>
                <div className="actions mt-5">
                  <Button
                    variant={done ? 'secondary' : 'outline'}
                    disabled={done || !scheduled || !!state.timer}
                    onClick={() =>
                      void update(
                        (s) =>
                          recordProgress(
                            materializeHabits(s, date),
                            habitTaskId(h.id, date),
                            true,
                            0,
                            false,
                          ),
                        `${h.title}：今天已完成。`,
                      )
                    }
                  >
                    <CheckCircle2 />
                    {done ? '今天已完成' : '标记今天完成'}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`编辑${h.title}`}
                    onClick={() => {
                      setError('');
                      setDraft({ ...h, days: [...h.days] });
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`删除${h.title}`}
                    onClick={() => {
                      setError('');
                      setRemove(h);
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}
      {draft && (
        <Dialog open onOpenChange={(open) => !open && setDraft(null)}>
          <DialogContent className="wide-dialog">
            <DialogHeader>
              <DialogTitle>
                {state.habits.some((h) => h.id === draft.id)
                  ? '调整这个习惯'
                  : '添加一个每日习惯'}
              </DialogTitle>
              <DialogDescription>
                不设置截止日期。每次安排时，小晚会根据时间和精力为它留出空间。
              </DialogDescription>
            </DialogHeader>
            <div className="form-grid">
              <Field label="习惯名称">
                <input
                  maxLength={100}
                  value={draft.title}
                  placeholder="例如：锻炼身体"
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label="每次时长（分钟）">
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={draft.minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, minutes: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="需要的精力">
                <Choice
                  label="习惯精力"
                  value={draft.energy}
                  options={energyOptions}
                  onChange={(v) => setDraft({ ...draft, energy: v as Energy })}
                />
              </Field>
              <Field label="优先级">
                <Choice
                  label="习惯优先级"
                  value={String(draft.priority)}
                  options={[
                    { value: '3', label: '高 · 尽量保留' },
                    { value: '2', label: '中 · 按节奏安排' },
                    { value: '1', label: '低 · 有空再做' },
                  ]}
                  onChange={(v) => setDraft({ ...draft, priority: Number(v) })}
                />
              </Field>
            </div>
            <div>
              <p className="field-note">重复日期</p>
              <div className="weekday-list">
                {['日', '一', '二', '三', '四', '五', '六'].map(
                  (name, index) => (
                    <Check
                      key={name}
                      label={`周${name}`}
                      checked={draft.days.includes(index)}
                      onChange={(v) =>
                        setDraft({
                          ...draft,
                          days: v
                            ? [...draft.days, index].sort((a, b) => a - b)
                            : draft.days.filter((d) => d !== index),
                        })
                      }
                    />
                  ),
                )}
              </div>
            </div>
            <Check
              label="允许分次完成"
              checked={draft.splittable}
              onChange={(v) => setDraft({ ...draft, splittable: v })}
            />
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => setDraft(null)}>
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (
                    await update(
                      (s) =>
                        saveHabit(s, { ...draft, title: draft.title.trim() }),
                      '习惯已保存，安排今晚时会自动纳入。',
                    )
                  )
                    setDraft(null);
                }}
              >
                保存习惯
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog open={!!remove} onOpenChange={(v) => !v && setRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{remove?.title}”？</AlertDialogTitle>
            <AlertDialogDescription>
              以后不再安排这个习惯。已经完成的记录和专注历史仍会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="alert error">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>保留</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (
                  remove &&
                  (await update(
                    (s) => removeHabit(s, remove.id),
                    '习惯已删除，历史记录已保留。',
                  ))
                )
                  setRemove(null);
              }}
            >
              删除习惯
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
