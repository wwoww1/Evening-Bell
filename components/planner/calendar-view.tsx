'use client';
import { useI18n } from '@/components/planner/language-provider';
import { createContext, useContext, useState } from 'react';
import type { ComponentProps } from 'react';
import { CalendarDays, ArrowRight, Clock3 } from 'lucide-react';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { zhCN, enUS } from 'react-day-picker/locale';
import { deadlineGoals, goalsOnDate, deadlineStatus } from '@/lib/calendar';
import { localDate } from '@/lib/model';
import type { AppState, Goal } from '@/lib/model';
const DeadlineContext = createContext<Goal[]>([]);
function DeadlineDayButton(props: ComponentProps<typeof CalendarDayButton>) {
  const { tr, locale } = useI18n();
  const goals = useContext(DeadlineContext),
    date = localDate(props.day.date),
    items = goals.filter((g) => localDate(new Date(g.deadline)) === date);
  return (
    <CalendarDayButton
      {...props}
      locale={locale === 'zh-CN' ? zhCN : enUS}
      className={items.length ? 'has-deadline' : ''}
    >
      <span>{props.day.date.getDate()}</span>
      {items.length > 0 && (
        <span
          className="deadline-marker"
          aria-label={tr('{0} 个截止目标', [items.length])}
        >
          {items.length}
          {tr(' 项截止')}
        </span>
      )}
    </CalendarDayButton>
  );
}
export function CalendarView({
  state,
  onEdit,
  now,
}: {
  state: AppState;
  onEdit: (goal: Goal) => void;
  now: number;
}) {
  const { tr, locale } = useI18n();
  const [selected, setSelected] = useState(() => new Date()),
    [month, setMonth] = useState(() => new Date());
  const goals = deadlineGoals(state),
    dates = goals.map((g) => new Date(g.deadline));
  const dayGoals = goalsOnDate(state, localDate(selected));
  const upcoming = [...goals]
    .filter(
      (g) => !['done', 'cancelled'].includes(deadlineStatus(state, g, now)),
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 6);
  return (
    <div className="calendar-grid">
      <section className="panel deadline-calendar">
        <div className="section-heading">
          <h2>
            <CalendarDays size={20} />
            {tr(' 截止日历')}
          </h2>
          <Button
            variant="outline"
            onClick={() => {
              const date = new Date(now);
              setMonth(date);
              setSelected(date);
            }}
          >
            {tr('回到本月')}
          </Button>
        </div>
        <DeadlineContext.Provider value={goals}>
          <Calendar
            locale={locale === 'zh-CN' ? zhCN : enUS}
            mode="single"
            required
            selected={selected}
            onSelect={setSelected}
            month={month}
            onMonthChange={setMonth}
            weekStartsOn={1}
            showOutsideDays
            modifiers={{ deadline: dates }}
            className="deadline-month"
            components={{ DayButton: DeadlineDayButton }}
          />
        </DeadlineContext.Provider>
        <div className="calendar-legend">
          <span className="calendar-dot" />
          {tr(' 有目标截止的日期')}{' '}
          <span className="muted">
            {tr('每日习惯没有截止日期，不显示在这里')}
          </span>
        </div>
      </section>
      <aside className="form-stack">
        <section className="panel">
          <div className="section-heading">
            <h2>
              {selected.toLocaleDateString(locale, {
                month: 'long',
                day: 'numeric',
              })}
            </h2>
            <span className="tag">
              {dayGoals.length}
              {tr(' 项截止')}
            </span>
          </div>
          {!dayGoals.length ? (
            <div className="empty-state">
              <CalendarDays />
              <p>{tr('这一天没有目标截止。')}</p>
            </div>
          ) : (
            dayGoals.map((g) => (
              <div className="deadline-detail" key={g.id}>
                <div className="actions">
                  <span
                    className={`deadline-state ${deadlineStatus(state, g, now)}`}
                  >
                    {deadlineStatus(state, g, now) === 'cancelled'
                      ? tr('已取消')
                      : deadlineStatus(state, g, now) === 'done'
                        ? tr('已完成')
                        : deadlineStatus(state, g, now) === 'overdue'
                          ? tr('已逾期')
                          : tr('待完成')}
                  </span>
                  <span className="muted">
                    <Clock3 size={14} className="inline mr-1" />
                    {g.deadline.slice(11, 16)}
                  </span>
                </div>
                <h3>{g.title}</h3>
                <p className="muted">{g.outcome}</p>
                <Button variant="ghost" onClick={() => onEdit(g)}>
                  {tr('查看 / 编辑计划')}
                  <ArrowRight />
                </Button>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <h2 className="icon-heading">{tr('接下来要留意')}</h2>
          {upcoming.map((g) => (
            <button
              key={g.id}
              className="deadline-list-button"
              onClick={() => {
                const day = new Date(g.deadline);
                setMonth(day);
                setSelected(day);
              }}
            >
              <span>{g.title}</span>
              <small>{g.deadline.replace('T', ' ')}</small>
              <ArrowRight size={15} />
            </button>
          ))}
          {!upcoming.length && (
            <p className="muted">{tr('目前没有待完成的截止目标。')}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
