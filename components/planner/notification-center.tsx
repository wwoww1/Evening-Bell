'use client';
import { useState } from 'react';
import { Bell, CalendarDays, Clock3, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { atomicUpdate } from '@/lib/store';
import type { AppState, AppNotification } from '@/lib/model';
export function NotificationCenter({
  state,
  open,
  onClose,
  onOpenItem,
}: {
  state: AppState;
  open: boolean;
  onClose: () => void;
  onOpenItem: (item: AppNotification) => void;
}) {
  const [error, setError] = useState('');
  async function markRead(id?: string) {
    setError('');
    try {
      await atomicUpdate((s) => ({
        ...s,
        notifications: s.notifications.map((n) =>
          !id || n.id === id ? { ...n, read: true } : n,
        ),
      }));
      return true;
    } catch {
      setError('未能更新通知，请检查浏览器存储空间。');
      return false;
    }
  }
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="notifications-sheet">
        <SheetHeader>
          <SheetTitle>
            <Bell size={20} className="inline mr-2" />
            通知
          </SheetTitle>
          <SheetDescription>查看任务、番茄钟和目标截止提醒。</SheetDescription>
        </SheetHeader>
        <div className="notification-toolbar">
          <span className="muted">
            {state.notifications.filter((n) => !n.read).length} 条未读
          </span>
          <Button
            variant="ghost"
            disabled={!state.notifications.some((n) => !n.read)}
            onClick={() => void markRead()}
          >
            <CheckCheck /> 全部已读
          </Button>
        </div>
        {error && (
          <p className="alert error mx-5" role="alert">
            {error}
          </p>
        )}
        <div className="notification-list">
          {state.notifications.map((n) => (
            <button
              className={`notification-item ${n.read ? '' : 'unread'}`}
              key={n.id}
              onClick={async () => {
                if (await markRead(n.id)) onOpenItem(n);
              }}
            >
              <span className="notification-icon">
                {n.kind === 'deadline' ? (
                  <CalendarDays size={19} />
                ) : (
                  <Clock3 size={19} />
                )}
              </span>
              <div>
                <h3>
                  {n.title}
                  {!n.read && <span className="unread-dot" />}
                </h3>
                <p>{n.message}</p>
                <small>
                  {new Date(n.createdAt).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              </div>
            </button>
          ))}
          {!state.notifications.length && (
            <div className="empty-state">
              <Bell />
              <h3>暂时没有新通知</h3>
              <p>有任务提醒或目标临近截止时，会出现在这里。</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
