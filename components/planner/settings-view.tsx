'use client';
import { useI18n } from '@/components/planner/language-provider';
import { LanguageSwitcher } from './language-switcher';
import { useRef, useState } from 'react';
import { isAnna } from '@/lib/anna-runtime';
import { parseBackup } from '@/lib/backup';
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
  const { tr } = useI18n();
  const [s, setS] = useState<Settings>({ ...state.settings }),
    [remove, setRemove] = useState(false),
    [error, setError] = useState('');
  const importFile = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<AppState | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const report = async (action: () => Promise<void>) => {
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const field = (key: keyof Settings, value: unknown) =>
    setS((old) => ({ ...old, [key]: value }));
  async function notifications(enabled: boolean) {
    if (enabled) {
      if (isAnna()) {
        setError(tr('ANNA 内使用应用内提醒；请保持应用打开。'));
        field('notifications', false);
        return;
      }
      if (!('Notification' in window)) {
        setError(tr('当前浏览器不支持系统通知，仍可使用应用内提醒。'));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError(tr('通知未获授权，应用内提示和计时仍可使用。'));
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
        tr('通常结束时间需晚于开始时间。跨午夜安排可在每日报到中单独设置。'),
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
          tr(
            '请检查时长：专注 1–180 分钟，短休息 1–60，长休息 1–90，准备和缓冲 0–120。',
          ),
        );
        return;
      }
    }
    await atomicUpdate((old) => ({ ...old, settings: s }));
    onNotice(tr('偏好已保存，将用于下一次规划。'));
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
        <section className="panel language-settings">
          <h2>{tr('语言')}</h2>
          <p className="muted">
            {tr(
              isAnna()
                ? '选择显示语言。更改会立即生效，并保存到 ANNA。'
                : '选择显示语言。更改会立即生效，并保存在当前浏览器。',
            )}
          </p>
          <LanguageSwitcher />
        </section>
        <section className="panel">
          <h2 className="icon-heading">
            <SlidersHorizontal size={19} />
            {tr(' 我的节奏')}
          </h2>
          <div className="form-grid">
            <Field label={tr('怎么称呼你')}>
              <input
                value={s.name}
                maxLength={30}
                placeholder={tr('你的名字（选填）')}
                onChange={(e) => field('name', e.target.value)}
              />
            </Field>
            <div />
            <Field label={tr('通常开始时间')}>
              <input
                type="time"
                value={s.usualStart}
                onChange={(e) => field('usualStart', e.target.value)}
              />
            </Field>
            <Field label={tr('通常结束时间')}>
              <input
                type="time"
                value={s.usualEnd}
                onChange={(e) => field('usualEnd', e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-5">
            <Check
              label={tr('我已确认这些通常可用时段，可用于未来容量估算')}
              checked={s.futureKnown}
              onChange={(v) => field('futureKnown', v)}
            />
          </div>
          <div className="weekday-list">
            {[
              tr('日'),
              tr('一'),
              tr('二'),
              tr('三'),
              tr('四'),
              tr('五'),
              tr('六'),
            ].map((day, index) => (
              <Check
                key={day}
                label={tr('周{0}', [day])}
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
            {tr('未来安排按这些时段估算；今天的例外在每日报到中填写。')}
          </p>
        </section>
        <section className="panel">
          <h2 className="icon-heading">
            <Clock3 size={19} />
            {tr(' 专注与休息')}
          </h2>
          <div className="form-grid">
            {[
              ['focusMinutes', tr('专注分钟')],
              ['breakMinutes', tr('短休息分钟')],
              ['longBreakMinutes', tr('每四轮长休息分钟')],
              ['preparation', tr('报到后准备分钟')],
              ['buffer', tr('结束前缓冲分钟')],
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
            <Sparkles size={19} />
            {tr(' 陪伴与提醒')}
          </h2>
          {toggle(
            'companion',
            tr('温和陪伴'),
            tr('在报到和复盘时，给你具体而轻松的反馈。'),
          )}
          {toggle(
            'notifications',
            tr('系统通知'),
            tr('提前五分钟提醒任务，以及专注和休息到时提醒。'),
          )}
          {toggle(
            'sound',
            tr('提示音'),
            tr('应用保持运行时，在到时提醒中播放短音。'),
          )}
          <div className="form-grid mt-4">
            <Field label={tr('允许提醒：从')}>
              <input
                type="time"
                value={s.notifyStart}
                onChange={(e) => field('notifyStart', e.target.value)}
              />
            </Field>
            <Field label={tr('允许提醒：到')}>
              <input
                type="time"
                value={s.notifyEnd}
                onChange={(e) => field('notifyEnd', e.target.value)}
              />
            </Field>
          </div>
          <p className="alert mt-4">
            {tr(
              '网页关闭、系统休眠或浏览器限制后台运行时，无法保证准时响铃。重新打开后会按实际经过时间恢复计时；拒绝系统通知不影响应用内提示。',
            )}
          </p>
        </section>
        {error && (
          <p className="alert error" role="alert">
            {tr(error)}
          </p>
        )}
        <Button onClick={() => void report(save)}>{tr('保存偏好设置')}</Button>
      </div>
      <aside className="form-stack">
        <section className="panel">
          <h2 className="icon-heading">
            <Shield size={19} />
            {tr(' 我的数据')}
          </h2>
          <p className="muted">
            {tr(
              isAnna()
                ? '计划、专注和心情记录保存在你个人的 ANNA 应用存储中，需要联网保存。建议定期导出备份。'
                : '计划、专注和心情记录保存在当前浏览器。清除浏览器数据会移除记录，建议定期导出。',
            )}
          </p>
          <Button
            variant="outline"
            className="mt-5 w-full"
            onClick={() => downloadJSON(rawBackup(), tr('晚钟-数据备份.json'))}
          >
            <Download />
            {tr(' 导出全部数据')}
          </Button>
          <input
            ref={importFile}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label={tr('导入备份')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void report(async () => {
                if (file.size > 240 * 1024)
                  throw new Error(
                    tr('备份超过 240 KiB，请先精简原应用中的记录。'),
                  );
                setImported(parseBackup(await file.text()));
              });
            }}
          />
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => importFile.current?.click()}
          >
            {tr('导入备份')}
          </Button>
          {isAnna() && (
            <>
              <p className="field-note mt-3">
                {tr(
                  '旧网页版数据可先导出，再在这里导入。打开多个窗口时，请等待保存完成；其他窗口的更新会在切回或稍后读取。',
                )}
              </p>
              <p className="field-note mt-3">
                {tr(
                  'AI 拆分、排序和陪伴会将相关计划及输入发送到 ANNA 模型服务，并使用你的模型额度。',
                )}
              </p>
              <a
                className="text-link"
                href="./privacy.html"
                target="_blank"
                rel="noreferrer"
              >
                {tr('隐私说明')}
              </a>
            </>
          )}
          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={() =>
              void report(async () => {
                await atomicUpdate((old) => ({
                  ...old,
                  checkin: { ...old.checkin, mood: '' },
                  plan: old.plan
                    ? {
                        ...old.plan,
                        checkin: { ...old.plan.checkin, mood: '' },
                      }
                    : null,
                  previousPlan: null,
                  reflections: old.reflections.map((r) => ({ ...r, mood: '' })),
                }));
                onNotice(tr('已删除所有心情记录。'));
              })
            }
          >
            {tr('删除心情记录')}
          </Button>
          <Button
            variant="destructive"
            className="mt-3 w-full"
            onClick={() => setRemove(true)}
          >
            <Trash2 />
            {tr(' 清除全部数据')}
          </Button>
        </section>
        <section className="panel">
          <h2 className="icon-heading">{tr('演示模式')}</h2>
          {toggle(
            'demoTimer',
            tr('10 秒演示番茄'),
            tr('仅用于展示。演示记录会单独标记，不计入正式专注统计。'),
          )}
        </section>
      </aside>
      <AlertDialog open={remove} onOpenChange={setRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tr(
                isAnna()
                  ? '清除你在 ANNA 晚钟中的全部记录？'
                  : '清除这个浏览器中的全部记录？',
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr('计划、专注记录和偏好将一并移除。建议先导出备份。')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr('保留数据')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void report(async () => {
                  await atomicUpdate(() => initialState());
                  setS(initialState().settings);
                  setRemove(false);
                  onNotice(
                    tr(isAnna() ? 'ANNA 应用记录已清除。' : '本地记录已清除。'),
                  );
                })
              }
            >
              {tr('确认清除')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!imported}
        onOpenChange={(open) => {
          if (!open && !importBusy) setImported(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr('用备份替换当前记录？')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                '当前计划、专注记录和偏好会被替换。请先导出当前数据；导入不会自动合并。',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p>
            {tr('备份包含 {0} 个目标、{1} 条专注记录。', [
              imported?.goals.length || 0,
              imported?.sessions.length || 0,
            ])}
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importBusy}>
              {tr('保留数据')}
            </AlertDialogCancel>
            <Button
              disabled={importBusy}
              onClick={() => {
                if (!imported) return;
                setImportBusy(true);
                void report(async () => {
                  await atomicUpdate(() => imported);
                  setS({ ...imported.settings });
                  setImported(null);
                  onNotice(tr('备份已导入。'));
                }).finally(() => setImportBusy(false));
              }}
            >
              {tr('确认导入')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
