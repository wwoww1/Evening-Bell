'use client';
import { useState } from 'react';
import { MessageSquare, Download, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Field, Choice } from './controls';
import { atomicUpdate } from '@/lib/store';
import { uid } from '@/lib/model';
import type { AppState, FeedbackEntry } from '@/lib/model';
import { downloadJSON } from './settings-view';
export function FeedbackDialog({
  state,
  onClose,
}: {
  state: AppState;
  onClose: () => void;
}) {
  const [category, setCategory] =
      useState<FeedbackEntry['category']>('suggestion'),
    [message, setMessage] = useState(''),
    [saved, setSaved] = useState(false),
    [error, setError] = useState('');
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="wide-dialog">
        <DialogHeader>
          <DialogTitle>
            <MessageSquare className="inline mr-2" size={20} />{' '}
            关于晚钟，你有什么想法？
          </DialogTitle>
          <DialogDescription>
            反馈保存在当前设备，可以导出分享。
          </DialogDescription>
        </DialogHeader>
        <Field label="反馈类型">
          <Choice
            label="反馈类型"
            value={category}
            options={[
              { value: 'suggestion', label: '功能建议' },
              { value: 'bug', label: '遇到问题' },
              { value: 'other', label: '其他想法' },
            ]}
            onChange={(v) => setCategory(v as FeedbackEntry['category'])}
          />
        </Field>
        <Field label="反馈内容">
          <textarea
            maxLength={3000}
            rows={5}
            placeholder="告诉我们你想改进什么，或描述遇到的问题。"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSaved(false);
            }}
          />
        </Field>
        {saved && (
          <output className="notice">
            <CheckCircle2 size={17} /> 反馈已保存在本机。
          </output>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button
            variant="outline"
            disabled={!state.feedbackEntries.length}
            onClick={() =>
              downloadJSON(
                JSON.stringify(state.feedbackEntries, null, 2),
                '晚钟-反馈.json',
              )
            }
          >
            <Download /> 导出反馈（{state.feedbackEntries.length}）
          </Button>
          <Button
            disabled={!message.trim()}
            onClick={async () => {
              setError('');
              try {
                await atomicUpdate((s) => ({
                  ...s,
                  feedbackEntries: [
                    ...s.feedbackEntries,
                    {
                      id: uid(),
                      category,
                      message: message.trim(),
                      createdAt: Date.now(),
                    },
                  ],
                }));
                setMessage('');
                setSaved(true);
              } catch {
                setError('未能保存，请检查浏览器存储空间。');
              }
            }}
          >
            保存反馈
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
