export function NotificationCount({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span
      className="agn-notification-count"
      aria-hidden="true"
      title={`${count} unread notifications`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
