'use client';
import { useState } from 'react';
import {
  Download,
  Shield,
  SlidersHorizontal,
  Clock3,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
import { Field, Check } from './controls';
import { atomicUpdate, rawBackup } from '@/lib/store';
import { initialState } from '@/lib/model';
import type { AppState, Settings } from '@/lib/model';
export function downloadJSON(content: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SettingsView({
  state,
  onNotice,
}: {
  state: AppState;
  onNotice: (s: string) => void;
}) {
  const [s, setS] = useState<Settings>({ ...state.settings }),
    [remove, setRemove] = useState(false),
    [error, setError] = useState('');
  const field = (key: keyof Settings, value: unknown) =>
    setS((old) => ({ ...old, [key]: value }));
  async function notifications(enabled: boolean) {
    if (enabled) {
      if (!('Notification' in window)) {
        setError('当前浏览器不支持系统通知，仍可使用应用内提醒。');
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('通知未获授权，应用内提示和计时仍可使用。');
        field('notifications', false);
        return;
      }
    }
    field('notifications', enabled);
  }
  async function save() {
    setError('');
    if (s.usualEnd <= s.usualStart) {
      setError(
        '通常结束时间需晚于开始时间。跨午夜安排可在每日报到中单独设置。',
      );
      return;
    }
    for (const [name, min, max] of [
      ['focusMinutes', 1, 180],
      ['breakMinutes', 1, 60],
      ['longBreakMinutes', 1, 90],
      ['preparation', 0, 120],
      ['buffer', 0, 120],
    ] as const) {
      if (!Number.isFinite(s[name]) || s[name] < min || s[name] > max) {
        setError(
          '请检查时长：专注 1–180 分钟，短休息 1–60，长休息 1–90，准备和缓冲 0–120。',
        );
        return;
      }
    }
    await atomicUpdate((old) => ({ ...old, settings: s }));
    onNotice('偏好已保存，将用于下一次规划。');
  }
  const toggle = (
    key: 'companion' | 'notifications' | 'sound' | 'demoTimer',
    title: string,
    description: string,
  ) => (
    <div className="setting-row">
      <div>
        <h3>{title}</h3>
        <p className="muted">{description}</p>
      </div>
      <Switch
        aria-label={title}
        checked={s[key]}
        onCheckedChange={(v) =>
          key === 'notifications' ? void notifications(v) : field(key, v)
        }
      />
    </div>
  );
  return (
    <div className="settings-grid">
      <div className="form-stack">
        <section className="panel">
          <h2 className="icon-heading">
            <SlidersHorizontal size={19} /> 我的节奏
          </h2>
          <div className="form-grid">
            <Field label="怎么称呼你">
              <input
                value={s.name}
                maxLength={30}
                placeholder="你的名字（选填）"
                onChange={(e) => field('name', e.target.value)}
              />
            </Field>
            <div />
            <Field label="通常开始时间">
              <input
                type="time"
                value={s.usualStart}
                onChange={(e) => field('usualStart', e.target.value)}
              />
            </Field>
            <Field label="通常结束时间">
              <input
                type="time"
                value={s.usualEnd}
                onChange={(e) => field('usualEnd', e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-5">
            <Check
              label="我已确认这些通常可用时段，可用于未来容量估算"
              checked={s.futureKnown}
              onChange={(v) => field('futureKnown', v)}
            />
          </div>
          <div className="weekday-list">
            {['日', '一', '二', '三', '四', '五', '六'].map((day, index) => (
              <Check
                key={day}
                label={`周${day}`}
                checked={s.usualDays.includes(index)}
                onChange={(v) =>
                  field(
                    'usualDays',
                    v
                      ? [...s.usualDays, index]
                      : s.usualDays.filter((d) => d !== index),
                  )
                }
              />
            ))}
          </div>
          <p className="field-note">
            未来安排按这些时段估算；今天的例外在每日报到中填写。
          </p>
        </section>
        <section className="panel">
          <h2 className="icon-heading">
            <Clock3 size={19} /> 专注与休息
          </h2>
          <div className="form-grid">
            {[
              ['focusMinutes', '专注分钟'],
              ['breakMinutes', '短休息分钟'],
              ['longBreakMinutes', '每四轮长休息分钟'],
              ['preparation', '报到后准备分钟'],
              ['buffer', '结束前缓冲分钟'],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  type="number"
                  min={key === 'buffer' || key === 'preparation' ? 0 : 1}
                  max={180}
                  value={s[key as keyof Settings] as number}
                  onChange={(e) =>
                    field(key as keyof Settings, Number(e.target.value))
                  }
                />
              </Field>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2 className="icon-heading">
            <Sparkles size={19} /> 陪伴与提醒
          </h2>
          {toggle(
            'companion',
            '温和陪伴',
            '在报到和复盘时，给你具体而轻松的反馈。',
          )}
          {toggle(
            'notifications',
            '系统通知',
            '提前五分钟提醒任务，以及专注和休息到时提醒。',
          )}
          {toggle('sound', '提示音', '应用保持运行时，在到时提醒中播放短音。')}
          <div className="form-grid mt-4">
            <Field label="允许提醒：从">
              <input
                type="time"
                value={s.notifyStart}
                onChange={(e) => field('notifyStart', e.target.value)}
              />
            </Field>
            <Field label="允许提醒：到">
              <input
                type="time"
                value={s.notifyEnd}
                onChange={(e) => field('notifyEnd', e.target.value)}
              />
            </Field>
          </div>
          <p className="alert mt-4">
            网页关闭、系统休眠或浏览器限制后台运行时，无法保证准时响铃。重新打开后会按实际经过时间恢复计时；拒绝系统通知不影响应用内提示。
          </p>
        </section>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <Button onClick={save}>保存偏好设置</Button>
      </div>
      <aside className="form-stack">
        <section className="panel">
          <h2 className="icon-heading">
            <Shield size={19} /> 我的数据
          </h2>
          <p className="muted">
            计划、专注和心情记录保存在当前浏览器。清除浏览器数据会移除记录，建议定期导出。
          </p>
          <Button
            variant="outline"
            className="mt-5 w-full"
            onClick={() => downloadJSON(rawBackup(), '晚钟-数据备份.json')}
          >
            <Download /> 导出全部数据
          </Button>
          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={async () => {
              await atomicUpdate((old) => ({
                ...old,
                checkin: { ...old.checkin, mood: '' },
                plan: old.plan
                  ? { ...old.plan, checkin: { ...old.plan.checkin, mood: '' } }
                  : null,
                previousPlan: null,
                reflections: old.reflections.map((r) => ({ ...r, mood: '' })),
              }));
              onNotice('已删除所有心情记录。');
            }}
          >
            删除心情记录
          </Button>
          <Button
            variant="destructive"
            className="mt-3 w-full"
            onClick={() => setRemove(true)}
          >
            <Trash2 /> 清除全部数据
          </Button>
        </section>
        <section className="panel">
          <h2 className="icon-heading">演示模式</h2>
          {toggle(
            'demoTimer',
            '10 秒演示番茄',
            '仅用于展示。演示记录会单独标记，不计入正式专注统计。',
          )}
        </section>
      </aside>
      <AlertDialog open={remove} onOpenChange={setRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除这个浏览器中的全部记录？</AlertDialogTitle>
            <AlertDialogDescription>
              计划、专注记录和偏好将一并移除。建议先导出备份。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>保留数据</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await atomicUpdate(() => initialState());
                setS(initialState().settings);
                setRemove(false);
                onNotice('本地记录已清除。');
              }}
            >
              确认清除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
