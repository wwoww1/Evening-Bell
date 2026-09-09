import { createTranslator } from './i18n.ts';
import type { Locale } from './i18n.ts';
import type { Energy } from './model.ts';
export interface DraftTask {
  title: string;
  outcome: string;
  minutes: number;
  energy: Energy;
  dependsOn: number[];
}
export function localDecompose(
  title: string,
  outcome: string,
  source: string,
  locale: Locale = 'en',
): DraftTask[] {
  const tr = createTranslator(locale);
  const lines = source
    .split(/\n|[；;]/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 30);
  if (lines.length)
    return lines.map((line) => {
      const m = line.match(/(\d+)\s*(?:分钟|mins?\b|minutes?\b)/i);
      return {
        title: line
          .replace(/[（(]?\d+\s*(?:分钟|mins?\b|minutes?\b)[)）]?/i, '')
          .trim()
          .slice(0, 160),
        outcome: tr('完成该项内容并检查结果'),
        minutes: m ? Math.min(480, Math.max(1, Number(m[1]))) : 25,
        energy: 'medium',
        dependsOn: [],
      };
    });
  return [
    {
      title: tr('明确「{0}」的具体步骤', [title]),
      outcome: tr('列出需要完成的内容与验收清单'),
      minutes: 15,
      energy: 'low',
      dependsOn: [],
    },
    {
      title: tr('推进「{0}」的第一份成果', [title]),
      outcome: outcome || tr('产出可检查的初稿'),
      minutes: 50,
      energy: 'high',
      dependsOn: [0],
    },
    {
      title: tr('检查成果并补齐遗漏'),
      outcome: tr('对照完成标准逐项检查'),
      minutes: 25,
      energy: 'medium',
      dependsOn: [1],
    },
  ];
}
export function validateDraftTasks(
  value: unknown,
  locale: Locale = 'en',
): DraftTask[] {
  const tr = createTranslator(locale);
  if (!Array.isArray(value) || value.length < 1 || value.length > 30)
    throw new Error(tr('未获得有效任务清单，请重试或手动添加。'));
  return value.map((raw: unknown, index) => {
    const t = raw as Record<string, unknown>;
    if (
      !t ||
      typeof t.title !== 'string' ||
      !t.title.trim() ||
      typeof t.minutes !== 'number' ||
      !Number.isFinite(t.minutes)
    )
      throw new Error(tr('生成的任务格式不完整，请重试。'));
    const dependencies = Array.isArray(t.dependsOn) ? t.dependsOn : [];
    if (
      dependencies.some(
        (x) =>
          !Number.isInteger(x) || (x as number) < 0 || (x as number) >= index,
      )
    )
      throw new Error(tr('生成的任务依赖无效，请重试。'));
    return {
      title: t.title.trim().slice(0, 160),
      outcome:
        typeof t.outcome === 'string'
          ? t.outcome.slice(0, 500)
          : tr('完成该项工作'),
      minutes: Math.max(1, Math.min(480, Math.round(t.minutes))),
      energy: ['low', 'medium', 'high'].includes(String(t.energy))
        ? (t.energy as Energy)
        : 'medium',
      dependsOn: dependencies as number[],
    };
  });
}
