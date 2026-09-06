'use client';
import { useState } from 'react';
import { CheckCircle2, Clock3, History, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field } from './controls';
import { atomicUpdate } from '@/lib/store';
import { localDate, MINUTE, uid, clockTime } from '@/lib/model';
import type { AppState } from '@/lib/model';
const wholeMinutes = (ms: number) => Math.floor(ms / MINUTE);
const secondsPart = (ms: number) => Math.floor(ms / 1000) % 60;
export function RecordsView({
  state,
  onNotice,
}: {
  state: AppState;
  onNotice: (s: string) => void;
}) {
  const today = localDate(),
    existing = state.reflections.find((r) => r.date === today);
  const [note, setNote] = useState(existing?.note || ''),
    [mood, setMood] = useState(existing?.mood || '');
  const sessions = state.sessions.filter((s) => !s.demo),
    todaySessions = sessions.filter(
      (s) => localDate(new Date(s.startedAt)) === today,
    );
  const total = sessions.reduce((n, s) => n + s.durationMs, 0);
  const todayMinutes = wholeMinutes(
    todaySessions.reduce((n, s) => n + s.durationMs, 0),
  );
  const done = state.tasks.filter((t) => t.status === 'done').length;
  return (
    <div className="form-stack">
      <div className="stat-grid">
        <div className="stat-card">
          <Clock3 />
          <div>
            <span>今天专注</span>
            <strong>
              {todayMinutes}
              <small> 分钟</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <History />
          <div>
            <span>累计专注</span>
            <strong>
              {wholeMinutes(total)}
              <small> 分钟</small>
            </strong>
          </div>
        </div>
        <div className="stat-card">
          <CheckCircle2 />
          <div>
            <span>已完成任务</span>
            <strong>
              {done}
              <small> 项</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="records-grid">
        <section className="panel">
          <Tabs defaultValue="sessions">
            <TabsList>
              <TabsTrigger value="sessions">专注记录</TabsTrigger>
              <TabsTrigger value="reflections">每日复盘</TabsTrigger>
            </TabsList>
            <TabsContent value="sessions">
              <div className="record-list">
                {[...state.sessions].reverse().map((s) => (
                  <div className="record-item" key={s.id}>
                    <span className="record-icon">
                      <Clock3 size={19} />
                    </span>
                    <div>
                      <h3>
                        {s.title}
                        {s.demo && <span className="tag ml-2">演示</span>}
                      </h3>
                      <p className="muted">
                        {localDate(new Date(s.startedAt))} ·{' '}
                        {clockTime(s.startedAt)}–{clockTime(s.endedAt)}
                      </p>
                    </div>
                    <strong>
                      {wholeMinutes(s.durationMs)}分{secondsPart(s.durationMs)}
                      秒
                    </strong>
                  </div>
                ))}
                {!state.sessions.length && (
                  <div className="empty-state">
                    <Clock3 />
                    <h3>从第一段专注开始</h3>
                    <p>每次真实投入，都会留在这里。</p>
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
                        aria-label={`删除${r.date}复盘`}
                        onClick={async () => {
                          await atomicUpdate((old) => ({
                            ...old,
                            reflections: old.reflections.filter(
                              (x) => x.id !== r.id,
                            ),
                          }));
                          onNotice('该条复盘已删除。');
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    {r.mood && <span className="tag">{r.mood}</span>}
                    <p>{r.note || '今天也给自己留了一点时间。'}</p>
                  </div>
                ))}
                {!state.reflections.length && (
                  <div className="empty-state">
                    <Sparkles />
                    <p>复盘可以很短，一句话也足够。</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </section>
        <aside className="panel self-start">
          <h2 className="icon-heading">
            <Sparkles size={18} /> 给今天一个轻轻的收尾
          </h2>
          <p className="muted mb-5">
            今天记录了 {todaySessions.length} 段专注。还有{' '}
            {
              state.tasks.filter(
                (t) => t.status === 'todo' || t.status === 'doing',
              ).length
            }{' '}
            项任务可以在下一次继续。
          </p>
          <div className="form-stack">
            <Field label="今天的心情（可跳过）">
              <input
                maxLength={100}
                value={mood}
                placeholder="例如：有点疲惫，但迈出了第一步"
                onChange={(e) => setMood(e.target.value)}
              />
            </Field>
            <Field label="记下进展或遇到的困难">
              <textarea
                maxLength={2000}
                value={note}
                placeholder="做成了什么？下一次想怎么调整？"
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
                onNotice('今天的复盘已保存。');
              }}
            >
              保存今天的复盘
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
