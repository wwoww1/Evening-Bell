'use client';
import { useI18n } from '@/components/planner/language-provider';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
export function Field({
  label,
  children,
  note,
  className = '',
}: {
  label: string;
  children: ReactNode;
  note?: string;
  className?: string;
}) {
  const { tr } = useI18n();
  return (
    <label className={`field ${className}`}>
      <span>{tr(label)}</span>
      {children}
      {note && <span className="field-note">{tr(note)}</span>}
    </label>
  );
}
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const { tr } = useI18n();
  return (
    <Select
      value={value}
      onValueChange={(v) => v !== null && onChange(v)}
      items={options.map((o) => ({ ...o, label: tr(o.label) }))}
    >
      <SelectTrigger aria-label={tr(label)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {tr(o.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const { tr } = useI18n();
  return (
    <label className="check-label">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span>{tr(label)}</span>
    </label>
  );
}
export const energyOptions = [
  { value: 'low', label: '有点累 · 轻一点' },
  { value: 'medium', label: '还不错 · 按平常来' },
  { value: 'high', label: '状态很好 · 挑战一下' },
];
export const statusOptions = [
  { value: 'todo', label: '待开始' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];
