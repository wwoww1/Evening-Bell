'use client';
import { CheckCircle2, Repeat2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from './language-provider';
import { clockTime } from '@/lib/model';
import type { AppState, Task } from '@/lib/model';

export function TodayHabits({
  state,
  date,
  tasks,
  onSchedule,
  onComplete,
}: {
  state: AppState;
  date: string;
  tasks: Task[];
  onSchedule: () => void;
  onComplete: (task: Task) => void;
}) {
  const { tr } = useI18n();
  if (!tasks.length) return null;
  return (
    <section className="today-habits" aria-label={tr('今日习惯')}>
      <div className="section-heading">
        <h3 className="icon-heading">
          <Repeat2 size={17} />
          {tr('今日习惯')}
        </h3>
        <span className="tag">
          {tr('已完成 {0}/{1}', [
            tasks.filter((task) => task.status === 'done').length,
            tasks.length,
          ])}
        </span>
      </div>
      <p className="muted">
        {tr('当天的习惯会自动显示在这里，可以直接打卡，也可以安排具体时段。')}
      </p>
      <div className="today-habit-list">
        {tasks.map((task) => {
          const done = task.status === 'done';
          const skipped =
            state.skipped.date === date && state.skipped.ids.includes(task.id);
          const blocks =
            state.plan?.date === date
              ? state.plan.blocks.filter(
                  (block) =>
                    block.type === 'focus' &&
                    block.taskId === task.id &&
                    !block.done,
                )
              : [];
          return (
            <div className="today-habit-row" key={task.id}>
              <div>
                <h4>{task.title}</h4>
                <p className="muted">
                  {done ? task.estimate : task.remaining}
                  {tr(' 分钟')} ·{' '}
                  {done
                    ? tr('今天已完成')
                    : skipped
                      ? tr('今天已延后')
                      : blocks.length
                        ? tr('已安排时段')
                        : tr('今天待安排')}
                </p>
                {!done && !skipped && blocks.length > 0 && (
                  <p className="muted">
                    {blocks
                      .map(
                        (block) =>
                          `${clockTime(block.start)}–${clockTime(block.end)}`,
                      )
                      .join(' · ')}
                  </p>
                )}
              </div>
              <Button
                variant={done ? 'secondary' : 'outline'}
                size="sm"
                aria-label={
                  done
                    ? tr('{0}：今天已完成。', [task.title])
                    : tr('标记{0}今天完成', [task.title])
                }
                disabled={done || !!state.timer}
                onClick={() => onComplete(task)}
              >
                <CheckCircle2 size={15} />
                {done ? tr('今天已完成') : tr('标记今天完成')}
              </Button>
            </div>
          );
        })}
      </div>
      {tasks.some(
        (task) =>
          task.status !== 'done' &&
          !(state.skipped.date === date && state.skipped.ids.includes(task.id)),
      ) && (
        <Button variant="ghost" onClick={onSchedule} disabled={!!state.timer}>
          {tr('安排习惯时段')}
        </Button>
      )}
    </section>
  );
}
