'use client';
import { useI18n } from '@/components/planner/language-provider';
import { useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field } from './controls';
import { atomicUpdate } from '@/lib/store';
import { localDate, addDays, MINUTE, uid, clockTime } from '@/lib/model';
import type { AppState, Session } from '@/lib/model';
import { sessionsOnDate, updateSessionNote } from '@/lib/sessions';
const wholeMinutes = (ms: number) => Math.floor(ms / MINUTE);
const secondsPart = (ms: number) => Math.floor(ms / 1000) % 60;
export function RecordsView({
  state,
  onNotice,
}: {
  state: AppState;
  onNotice: (s: string) => void;
}) {
  const { tr } = useI18n();
  const today = localDate(),
    existing = state.reflections.find((r) => r.date === today);
  const [note, setNote] = useState(existing?.note || ''),
    [mood, setMood] = useState(existing?.mood || '');
  const [selectedDate, setSelectedDate] = useState(today);
  const daySessions = sessionsOnDate(state.sessions, selectedDate);
  const realDaySessions = daySessions.filter((s) => !s.demo);
  const sessions = state.sessions.filter((s) => !s.demo),
    todaySessions = sessions.filter(
      (s) => localDate(new Date(s.startedAt)) === today,
    );
  const total = sessions.reduce((n, s) => n + s.durationMs, 0);
  const dayMinutes = wholeMinutes(
    realDaySessions.reduce((n, s) => n + s.durationMs, 0),
  );
  return (
    <div className="form-stack">
      <div className="stat-grid">
        <div className="stat-card">
          <Clock3 />
          <div>
            <span>
              {selectedDate === today ? tr('今天专注') : tr('当日专注')}
            </span>
            <strong>
              {dayMinutes}
              <small>{tr(' 分钟')}</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <History />
          <div>
            <span>{tr('累计专注')}</span>
            <strong>
              {wholeMinutes(total)}
              <small>{tr(' 分钟')}</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <CalendarDays />
          <div>
            <span>{tr('当日番茄钟')}</span>
            <strong>
              {realDaySessions.length}
              <small>{tr(' 段')}</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="records-grid">
        <section className="panel">
          <Tabs defaultValue="sessions">
            <TabsList>
              <TabsTrigger value="sessions">{tr('专注记录')}</TabsTrigger>
              <TabsTrigger value="reflections">{tr('每日复盘')}</TabsTrigger>
            </TabsList>
            <TabsContent value="sessions">
              <div className="record-date-bar">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={tr('前一天')}
                  onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                >
                  <ChevronLeft size={16} />
                </Button>
                <Field label={tr('记录日期')}>
                  <input
                    type="date"
                    max={today}
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value && e.target.validity.valid)
                        setSelectedDate(e.target.value);
                    }}
                  />
                </Field>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={tr('后一天')}
                  disabled={selectedDate >= today}
                  onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                >
                  <ChevronRight size={16} />
                </Button>
                <Button
                  variant="ghost"
                  disabled={selectedDate === today}
                  onClick={() => setSelectedDate(today)}
                >
                  {tr('今天')}
                </Button>
              </div>
              <p className="muted record-date-note">
                {tr('跨午夜的专注归入开始当天，暂停不计入专注时长。')}
              </p>
              <div className="record-list">
                {daySessions.map((session) => (
                  <SessionRecord
                    key={session.id}
                    session={session}
                    onNotice={onNotice}
                  />
                ))}
                {!daySessions.length && (
                  <div className="empty-state">
                    <Clock3 />
                    <h3>{tr('这一天还没有专注记录')}</h3>
                    <p>{tr('换个日期查看，或随时开始一段番茄钟。')}</p>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="reflections">
              <div className="record-list">
                {[...state.reflections].reverse().map((r) => (
                  <div className="reflection-item" key={r.id}>
                    <div className="section-heading">
                      <h3>{r.date}</h3>
                      <Button
                        variant="ghost"
                        aria-label={tr('删除{0}复盘', [r.date])}
                        onClick={async () => {
                          await atomicUpdate((old) => ({
                            ...old,
                            reflections: old.reflections.filter(
                              (x) => x.id !== r.id,
                            ),
                          }));
                          onNotice(tr('该条复盘已删除。'));
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    {r.mood && <span className="tag">{r.mood}</span>}
                    <p>{r.note || tr('今天也给自己留了一点时间。')}</p>
                  </div>
                ))}
                {!state.reflections.length && (
                  <div className="empty-state">
                    <Sparkles />
                    <p>{tr('复盘可以很短，一句话也足够。')}</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>
        <aside className="panel self-start">
          <h2 className="icon-heading">
            <Sparkles size={18} />
            {tr(' 给今天一个轻轻的收尾')}
          </h2>
          <p className="muted mb-5">
            {tr('今天记录了 ')}
            {todaySessions.length}
            {tr(' 段专注。还有')}{' '}
            {
              state.tasks.filter(
                (t) => t.status === 'todo' || t.status === 'doing',
              ).length
            }{' '}
            {tr('项任务可以在下一次继续。')}
          </p>
          <div className="form-stack">
            <Field label={tr('今天的心情（可跳过）')}>
              <input
                maxLength={100}
                value={mood}
                placeholder={tr('例如：有点疲惫，但迈出了第一步')}
                onChange={(e) => setMood(e.target.value)}
              />
            </Field>
            <Field label={tr('记下进展或遇到的困难')}>
              <textarea
                maxLength={2000}
                value={note}
                placeholder={tr('做成了什么？下一次想怎么调整？')}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <Button
              onClick={async () => {
                await atomicUpdate((old) => ({
                  ...old,
                  reflections: [
                    ...old.reflections.filter((r) => r.date !== today),
                    { id: existing?.id || uid(), date: today, note, mood },
                  ],
                }));
                onNotice(tr('今天的复盘已保存。'));
              }}
            >
              {tr('保存今天的复盘')}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SessionRecord({
  session,
  onNotice,
}: {
  session: Session;
  onNotice: (message: string) => void;
}) {
  const { tr } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const startDate = localDate(new Date(session.startedAt));
  const endDate = localDate(new Date(session.endedAt));
  async function save() {
    setSaving(true);
    setError('');
    try {
      await atomicUpdate((old) =>
        updateSessionNote(old, session.id, draft, baseline),
      );
      setEditing(false);
      onNotice(tr('备注已保存。'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="session-record">
      <div className="record-item">
        <span className="record-icon">
          <Clock3 size={19} />
        </span>
        <div>
          <h3>
            {session.taskId ? session.title : tr('自由专注')}
            {session.demo && <span className="tag ml-2">{tr('演示')}</span>}
          </h3>
          <p className="muted">
            {clockTime(session.startedAt)}–
            {endDate !== startDate ? `${endDate} ` : ''}
            {clockTime(session.endedAt)}
          </p>
        </div>
        <strong>
          {wholeMinutes(session.durationMs)}
          {tr('分')}
          {secondsPart(session.durationMs)}
          {tr('秒')}
        </strong>
      </div>
      {editing ? (
        <div className="form-stack session-note-editor">
          <Field label={tr('这段时间做了什么？')}>
            <textarea
              maxLength={2000}
              value={draft}
              disabled={saving}
              placeholder={tr('例如：读完一章书，整理了项目思路')}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Field>
          <div className="actions">
            <Button disabled={saving} onClick={save}>
              {saving ? tr('保存中…') : tr('保存备注')}
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setEditing(false)}
            >
              {tr('取消')}
            </Button>
          </div>
          {error && (
            <p className="alert error" role="alert">
              {tr(error)}
            </p>
          )}
        </div>
      ) : (
        <div className="session-note">
          {session.note && <p>{session.note}</p>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(session.note || '');
              setBaseline(session.note || '');
              setError('');
              setEditing(true);
            }}
          >
            <Pencil size={14} />
            {session.note ? tr('编辑备注') : tr('添加备注')}
          </Button>
        </div>
      )}
    </article>
  );
}
