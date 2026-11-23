'use client';

export type InboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  relatedInvoiceId?: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationInboxProps = {
  items: InboxItem[];
  emptyLabel?: string;
  onMarkAllRead?: () => void;
  onMarkOneRead?: (id: string) => void;
  onOpenItem?: (item: InboxItem) => void;
  markAllBusy?: boolean;
};

function typeMeta(type: string): { label: string; tone: string } {
  switch (type) {
    case 'RENT_OVERDUE':
      return { label: 'Overdue', tone: 'inbox-tone-danger' };
    case 'RENT_DUE':
      return { label: 'Due', tone: 'inbox-tone-warn' };
    case 'PAYMENT_SUBMITTED':
      return { label: 'Review', tone: 'inbox-tone-accent' };
    case 'PAYMENT_CONFIRMED':
      return { label: 'Confirmed', tone: 'inbox-tone-ok' };
    case 'PAYMENT_REJECTED':
      return { label: 'Rejected', tone: 'inbox-tone-danger' };
    default:
      return { label: 'Update', tone: 'inbox-tone-muted' };
  }
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function NotificationGroup({
  title,
  items,
  unread,
  onOpenItem,
  onMarkOneRead,
}: {
  title: string;
  items: InboxItem[];
  unread: boolean;
  onOpenItem?: (item: InboxItem) => void;
  onMarkOneRead?: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="inbox-group">
      <div className="inbox-group-head">
        <p className="eyebrow">{title}</p>
        <span className="inbox-count mono">{items.length}</span>
      </div>
      <ul className="inbox-list">
        {items.map((item) => {
          const meta = typeMeta(item.type);
          const clickable = Boolean(onOpenItem);
          return (
            <li
              key={item.id}
              className={`inbox-item ${meta.tone} ${unread ? 'is-unread' : 'is-read'} ${clickable ? 'is-clickable' : ''}`}
              onClick={() => onOpenItem?.(item)}
              onKeyDown={(e) => {
                if (!clickable) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenItem?.(item);
                }
              }}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              <div className="inbox-item-main">
                <div className="inbox-item-meta">
                  <span className="inbox-type">{meta.label}</span>
                  <span className="mono inbox-when">{formatWhen(item.createdAt)}</span>
                </div>
                <p className="inbox-title">{item.title}</p>
                <p className="inbox-body">{item.body}</p>
                {unread && onMarkOneRead ? (
                  <button
                    type="button"
                    className="inbox-mark-one"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkOneRead(item.id);
                    }}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
              {unread ? <span className="inbox-unread-dot" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NotificationInbox({
  items,
  emptyLabel = 'No notifications yet.',
  onMarkAllRead,
  onMarkOneRead,
  onOpenItem,
  markAllBusy,
}: NotificationInboxProps) {
  const sorted = [...items].sort((a, b) => {
    const aUnread = a.readAt ? 0 : 1;
    const bUnread = b.readAt ? 0 : 1;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const unread = sorted.filter((item) => !item.readAt);
  const earlier = sorted.filter((item) => item.readAt);
  const unreadCount = unread.length;

  return (
    <section className="section panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Inbox</p>
          <h2 className="section-title mb-0">Notifications</h2>
        </div>
        <div className="section-head-actions">
          {unreadCount > 0 ? (
            <span className="badge badge-accent mono">{unreadCount} new</span>
          ) : (
            <span className="badge mono">All caught up</span>
          )}
          {unreadCount > 0 && onMarkAllRead ? (
            <button
              type="button"
              disabled={markAllBusy}
              onClick={onMarkAllRead}
              className="btn btn-ghost btn-sm"
            >
              Mark all read
            </button>
          ) : null}
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="empty-copy">{emptyLabel}</p>
      ) : (
        <div className="inbox-stack">
          <NotificationGroup
            title="Needs attention"
            items={unread}
            unread
            onOpenItem={onOpenItem}
            onMarkOneRead={onMarkOneRead}
          />
          <NotificationGroup
            title="Earlier"
            items={earlier.slice(0, 6)}
            unread={false}
            onOpenItem={onOpenItem}
          />
        </div>
      )}
    </section>
  );
}
