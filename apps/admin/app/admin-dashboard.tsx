'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStaffAdminClient } from '@auction-ng/api-client/staff-admin';
import { createCatalogueClient } from '@auction-ng/api-client';
import { createWithdrawalClient } from '@auction-ng/api-client/withdrawals';
import { ApiError } from '@auction-ng/api-client/auth';
import {
  formatNaira,
  STAFF_PERMISSIONS,
  type StaffRow,
  type StaffRecordQuery,
  type StaffPermission,
  type TokenResponse,
} from '@auction-ng/shared';
import {
  StaffShell,
  StaffHeading,
  StaffPickupDeskAction,
  StaffInventoryNavigation,
  StaffOverview,
  StaffMessage,
  StaffBadge,
  StaffSearch,
  staffNavigation,
  type StaffSection,
} from '@auction-ng/ui/web/staff-dashboard-view';
import { Button } from '@auction-ng/ui/web/button';
import { Input } from '@auction-ng/ui/web/input';
import { Dialog } from '@auction-ng/ui/web/dialog';
import {
  TopDealManager,
  type TopDealRow,
} from '@auction-ng/ui/web/top-deal-manager';
import { InventoryIntake, InventoryCsv } from './inventory-intake';
import { ScheduleControl } from './schedule-control';
import { PickupArrivals } from './pickup-arrivals';
import { CheckInBuyer } from './check-in-buyer';
import type { PickupVisit } from '@auction-ng/shared/pickup-visit-schemas';
import { SupportDesk } from './support-desk';
import { StaffNotificationBell } from '@auction-ng/ui/web/staff-notification-bell';
import { connectStaffActivity } from '@auction-ng/api-client/staff-admin';
import { WalletControlsSettings } from './wallet-controls';
import { AuctionFeeSettings } from './auction-fees';
import { SetupManager } from './setup-manager';
import { StaffPersonalSettings } from './staff-personal-settings';
function errorText(cause: unknown) {
  return cause instanceof ApiError
    ? ({
        400: 'Check the fields and try again.',
        401: 'Your staff session expired. Sign in again.',
        403: 'Your permissions no longer allow this action.',
        404: 'This record is no longer available.',
        409: 'This record changed or is protected by linked history. Reload it before trying again.',
        429: 'Too many requests. Please wait before retrying.',
      }[cause.status] ??
        'The server could not confirm the result. Retry this same action.')
    : 'The request could not be confirmed. Check your connection and retry this same action.';
}
function useStaffRead<T>(
  load: () => Promise<T>,
  enabled: boolean,
  key: string,
) {
  const latest = useRef(load);
  latest.current = load;
  const [snapshot, setSnapshot] = useState<{ key: string; value: T }>(),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      running = false;
    const read = async () => {
      if (!active || running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const value = await latest.current();
        if (active) {
          setSnapshot({ key, value });
          setError('');
        }
      } catch (cause) {
        if (active) {
          setError(errorText(cause));
          if (
            cause instanceof ApiError &&
            [401, 403, 404].includes(cause.status)
          )
            setSnapshot(undefined);
        }
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    window.addEventListener('lotvanta:staff-refresh', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
      window.removeEventListener('lotvanta:staff-refresh', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [enabled, key, revision]);
  return {
    data: enabled && snapshot?.key === key ? snapshot.value : undefined,
    error,
    refresh,
  };
}
type Action = {
  kind:
    | 'role'
    | 'invite'
    | 'assign'
    | 'archive'
    | 'buyer'
    | 'refund'
    | 'withdrawal'
    | 'intake'
    | 'csv';
  row?: StaffRow;
  operation?: string;
};
type Props = {
  apiUrl: string;
  session: TokenResponse;
  deviceId: string;
  online: boolean;
  onSession: (s: TokenResponse) => void;
  onSignOut: () => void;
  onSecurity: () => void;
};
const descriptions: Record<StaffSection, string> = {
  overview: 'A clear view of today’s auctions, sales and warehouse work.',
  categories: 'Organise item categories and preserve their listing history.',
  centres: 'Manage pickup addresses, opening hours and collection capacity.',
  inventory:
    'Prepare stock, add accurate photos and keep your catalogue organised.',
  auctions: 'Schedule auctions, curate Top Deals and review unsold stock.',
  pickup: 'Scan buyer passes and confirm exactly which items leave the centre.',
  buyers: 'Find buyer accounts and review access and account strikes.',
  support: 'Keep conversations moving and help buyers resolve their questions.',
  finance: 'Review paid orders, wallet refunds and withdrawal requests.',
  staff: 'Manage your team and decide exactly what each role can do.',
  audit: 'A permanent record of staff actions and operational changes.',
  trash:
    'Restore archived records. Permanently remove only safe unused records.',
};
export function AdminDashboard({
  apiUrl,
  session,
  deviceId,
  online,
  onSession,
  onSignOut,
  onSecurity,
}: Props) {
  const client = useMemo(
    () =>
      createStaffAdminClient(apiUrl, {
        accessToken: session.accessToken,
        deviceId,
      }),
    [apiUrl, session.accessToken, deviceId],
  );
  const owner = session.user.id;
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [arrival, setArrival] = useState<PickupVisit>();
  const [personal, setPersonal] = useState<'profile' | 'preferences'>(),
    [auditId, setAuditId] = useState<string>();
  const preferences = useStaffRead(
    () => client.preferences(),
    true,
    owner + ':preferences',
  );
  const auditDetail = useStaffRead(
    () => client.auditDetail(auditId ?? ''),
    !!auditId,
    owner + ':audit:' + auditId,
  );
  useEffect(() => {
    document.documentElement.dataset.staffCompact = String(
      preferences.data?.compactTables ?? false,
    );
    document.documentElement.dataset.staffReduceMotion = String(
      preferences.data?.reduceMotion ?? false,
    );
    return () => {
      delete document.documentElement.dataset.staffCompact;
      delete document.documentElement.dataset.staffReduceMotion;
    };
  }, [owner, preferences.data?.compactTables, preferences.data?.reduceMotion]);
  const [connected, setConnected] = useState(false),
    [noticeCursor, setNoticeCursor] = useState<string>(),
    [noticePages, setNoticePages] = useState<(string | undefined)[]>([]),
    [noticeBusy, setNoticeBusy] = useState(false),
    [noticeError, setNoticeError] = useState(''),
    [conversationId, setConversationId] = useState('');
  useEffect(
    () =>
      connectStaffActivity(
        process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4001',
        { accessToken: session.accessToken, deviceId },
        () => window.dispatchEvent(new Event('lotvanta:staff-refresh')),
        setConnected,
      ),
    [session.accessToken, deviceId],
  );
  const [section, setSection] = useState<StaffSection>('overview'),
    [tab, setTab] = useState('invoices'),
    [trashKind, setTrashKind] = useState<'lots' | 'buyers' | 'staff' | 'roles'>(
      'lots',
    ),
    [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [action, setAction] = useState<Action>(),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [roleId, setRoleId] = useState(''),
    [permissions, setPermissions] = useState<StaffPermission[]>([]),
    [reason, setReason] = useState(''),
    [confirmWord, setConfirmWord] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [invitation, setInvitation] = useState('');
  const actionKey = useRef(crypto.randomUUID()),
    pending = useRef<
      | (() => Promise<{
          id: string;
          message: string;
          invitationToken?: string;
        }>)
      | undefined
    >(undefined);
  const access = useStaffRead(() => client.me(), true, owner + ':access');
  const noticePermissionKey =
    access.data?.permissions.slice().sort().join(',') ?? '';
  useEffect(() => {
    setNoticeCursor(undefined);
    setNoticePages([]);
  }, [owner, noticePermissionKey]);
  const inbox = useStaffRead(
    () => client.notifications(noticeCursor),
    !!access.data,
    owner +
      ':notifications:' +
      noticePermissionKey +
      ':' +
      (noticeCursor ?? ''),
  );
  async function readNotices(ids: string[]) {
    if (!ids.length) return;
    setNoticeBusy(true);
    setNoticeError('');
    try {
      await client.readNotifications(ids);
      inbox.refresh();
    } catch (cause) {
      setNoticeError(errorText(cause));
      throw cause;
    } finally {
      setNoticeBusy(false);
    }
  }
  const can = (p: StaffPermission) =>
    access.data?.permissions.includes(p) ?? false;
  const navigation = staffNavigation.filter((n) => can(n.permission));
  const lastPage = useRef('');
  useEffect(() => {
    if (
      !access.data ||
      !navigation.some((n) => n.id === section) ||
      lastPage.current === owner + ':' + section
    )
      return;
    lastPage.current = owner + ':' + section;
    void client
      .visit(section)
      .catch(() =>
        setError(
          'This page visit could not be recorded. Reconnect before making changes.',
        ),
      );
  }, [owner, section, client, access.data]);
  const navigate = useCallback((next: StaffSection) => {
    setSection(next);
    setCursor(undefined);
    setPages([]);
    setStatus('');
    setQuery('');
    setSearch('');
    setTab('invoices');
    history.replaceState(null, '', '?section=' + next);
  }, []);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('section');
    if (staffNavigation.some((n) => n.id === s)) setSection(s as StaffSection);
    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get('search');
    if (initialSearch && initialSearch.length <= 120) {
      setSearch(initialSearch);
      setQuery(initialSearch);
    }
    if (params.get('tab') === 'withdrawals') setTab('withdrawals');
    const targetSearch = params.get('search');
    if (targetSearch && targetSearch.length <= 120) {
      setSearch(targetSearch);
      setQuery(targetSearch);
    }
    setConversationId(params.get('conversation') ?? '');
  }, []);
  useEffect(() => {
    if (
      access.data &&
      !navigation.some((n) => n.id === section) &&
      navigation[0]
    )
      navigate(navigation[0].id);
  }, [access.data, section, navigate]);
  const overview = useStaffRead(
    () => client.overview(),
    section === 'overview' && can('dashboard.view'),
    owner + ':overview',
  );
  const kind: StaffRecordQuery['kind'] =
    section === 'inventory'
      ? 'lots'
      : section === 'buyers'
        ? 'buyers'
        : section === 'staff'
          ? tab === 'roles'
            ? 'roles'
            : 'staff'
          : section === 'audit'
            ? 'audit'
            : section === 'trash'
              ? trashKind
              : tab === 'withdrawals'
                ? 'withdrawals'
                : 'invoices';
  const isTable =
    ['inventory', 'buyers', 'staff', 'audit', 'trash'].includes(section) ||
    (section === 'finance' && tab !== 'settings');
  const records = useStaffRead(
    () =>
      client.records({
        kind,
        view: section === 'trash' ? 'archived' : 'active',
        limit: 20,
        cursor,
        status: status || undefined,
        search: query || undefined,
      }),
    !!access.data && isTable,
    JSON.stringify([owner, kind, section, query, status, cursor]),
  );
  const roleOptions = useStaffRead(
    () => client.records({ kind: 'roles', limit: 50 }),
    can('staff.manage') &&
      (section === 'staff' ||
        (!!action && ['invite', 'assign'].includes(action.kind))),
    owner + ':role-options',
  );
  function resetPages() {
    setCursor(undefined);
    setPages([]);
  }
  function open(next: Action) {
    if (busy) return;
    setError('');
    setMessage('');
    setAction(next);
    setName(next.kind === 'role' ? (next.row?.title ?? '') : '');
    setPermissions(next.row?.permissions ?? []);
    setRoleId(next.row?.roleId ?? roleOptions.data?.items[0]?.id ?? '');
    setEmail('');
    setReason('');
    setConfirmWord('');
    setInvitation('');
    actionKey.current = crypto.randomUUID();
    pending.current = undefined;
  }
  async function submit() {
    if (!action) return;
    setBusy(true);
    setError('');
    const common = { reason, idempotencyKey: actionKey.current };
    const row = action.row;
    try {
      if (!pending.current) {
        if (action.kind === 'role')
          pending.current = () =>
            client.saveRole({
              ...common,
              id: row?.id,
              name,
              permissions,
              expectedRevision: row?.revision,
            });
        else if (action.kind === 'invite')
          pending.current = () =>
            client.invite({ ...common, name, email, roleId });
        else if (action.kind === 'assign' && row)
          pending.current = () =>
            client.assign({
              ...common,
              id: row.id,
              roleId,
              expectedUpdatedAt: row.updatedAt,
            });
        else if (action.kind === 'archive' && row)
          pending.current = () =>
            client.archive({
              ...common,
              id: row.id,
              entity:
                kind === 'lots' ? 'lot' : kind === 'roles' ? 'role' : 'user',
              operation: action.operation as 'archive' | 'restore' | 'purge',
              expectedUpdatedAt: row.updatedAt,
            });
        else if (action.kind === 'buyer' && row)
          pending.current = () =>
            client.buyerAction({
              ...common,
              id: row.id,
              operation: action.operation as 'strike' | 'activate' | 'suspend',
              expectedUpdatedAt: row.updatedAt,
            });
        else if (action.kind === 'refund' && row)
          pending.current = () =>
            client.refund({ ...common, invoiceId: row.id });
        else if (action.kind === 'withdrawal' && row)
          pending.current = async () => {
            const r = await createWithdrawalClient(apiUrl, {
              accessToken: session.accessToken,
              deviceId,
            }).review(row.id, {
              approve: action.operation === 'approve',
              reason,
            });
            return {
              id: r.id,
              message:
                'Withdrawal review recorded. Final bank status updates automatically.',
            };
          };
      }
      if (!pending.current) return;
      const result = await pending.current();
      setMessage(result.message);
      pending.current = undefined;
      if (result.invitationToken)
        setInvitation(
          window.location.origin + '/enroll#' + result.invitationToken,
        );
      else setAction(undefined);
      records.refresh();
      roleOptions.refresh();
      overview.refresh();
      access.refresh();
    } catch (cause) {
      setError(errorText(cause));
      if (
        cause instanceof ApiError &&
        [400, 401, 403, 404, 409, 429].includes(cause.status)
      ) {
        pending.current = undefined;
        actionKey.current = crypto.randomUUID();
      }
    } finally {
      setBusy(false);
    }
  }
  const credentials = {
    apiUrl,
    accessToken: session.accessToken,
    deviceId,
    online,
  };
  const title =
    staffNavigation.find((n) => n.id === section)?.label ?? 'Workspace';
  return (
    <StaffShell
      name={session.user.name}
      role={access.data?.roleName ?? session.user.role}
      section={section}
      permissions={access.data?.permissions ?? []}
      onNavigate={navigate}
      onSignOut={onSignOut}
      onSecurity={() => {
        void client.visit('security').catch(() => {});
        onSecurity();
      }}
      onProfile={() => {
        void client.visit('profile').catch(() => {});
        setPersonal('profile');
      }}
      onPreferences={() => {
        void client.visit('preferences').catch(() => {});
        setPersonal('preferences');
      }}
      notifications={
        <StaffNotificationBell
          online={online}
          data={inbox.data}
          error={noticeError || inbox.error}
          busy={noticeBusy}
          connected={connected}
          onRead={readNotices}
          onOpen={(href) => {
            const params = new URL(href, window.location.origin).searchParams;
            const target = params.get('section');
            if (navigation.some((n) => n.id === target)) {
              navigate(target as StaffSection);
              if (params.get('tab') === 'withdrawals') setTab('withdrawals');
              setConversationId(params.get('conversation') ?? '');
              history.replaceState(null, '', href);
            }
          }}
          onRetry={() => {
            setNoticeError('');
            inbox.refresh();
          }}
          hasPrevious={noticePages.length > 0}
          onNext={() => {
            if (inbox.data?.nextCursor) {
              setNoticePages((p) => [...p, noticeCursor]);
              setNoticeCursor(inbox.data.nextCursor);
            }
          }}
          onPrevious={() => {
            setNoticeCursor(noticePages.at(-1));
            setNoticePages((p) => p.slice(0, -1));
          }}
        />
      }
    >
      <StaffHeading title={title} description={descriptions[section]}>
        {(section === 'overview' || section === 'pickup') &&
          can('pickup.manage') && (
            <StaffPickupDeskAction onClick={() => setCheckInOpen(true)} />
          )}
        {section === 'inventory' && can('inventory.write') && (
          <>
            <Button variant="secondary" onClick={() => open({ kind: 'csv' })}>
              Import CSV
            </Button>
            <Button onClick={() => open({ kind: 'intake' })}>Add item</Button>
          </>
        )}
        {section === 'staff' && (
          <>
            <Button variant="secondary" onClick={() => open({ kind: 'role' })}>
              Create role
            </Button>
            <Button onClick={() => open({ kind: 'invite' })}>
              Invite staff
            </Button>
          </>
        )}
      </StaffHeading>
      <StaffInventoryNavigation
        section={section}
        permissions={access.data?.permissions ?? []}
        onNavigate={navigate}
      />
      {(section === 'categories' || section === 'centres') &&
        can('setup.manage') && (
          <SetupManager
            key={owner + ':' + section}
            client={client}
            kind={section === 'categories' ? 'category' : 'location'}
            online={online}
            canPurge={can('records.purge')}
          />
        )}
      <Dialog
        open={!!personal}
        title={personal === 'profile' ? 'Profile' : 'Preferences'}
        onClose={() => setPersonal(undefined)}
      >
        {personal && (preferences.data || personal === 'profile') ? (
          <StaffPersonalSettings
            key={personal}
            mode={personal}
            session={session}
            apiUrl={apiUrl}
            deviceId={deviceId}
            online={online}
            preferences={
              preferences.data ?? { compactTables: false, reduceMotion: false }
            }
            onSession={onSession}
            onSaved={() => {
              preferences.refresh();
              access.refresh();
            }}
          />
        ) : preferences.error ? (
          <StaffMessage>
            {preferences.error}
            <Button onClick={preferences.refresh}>Retry</Button>
          </StaffMessage>
        ) : (
          <p role="status">Loading preferences…</p>
        )}
      </Dialog>
      <Dialog
        open={!!auditId}
        title="Activity details"
        onClose={() => setAuditId(undefined)}
      >
        {auditDetail.error ? (
          <StaffMessage>{auditDetail.error}</StaffMessage>
        ) : auditDetail.data ? (
          <div className="lv-staff-audit-detail">
            <dl>
              <dt>Action</dt>
              <dd>{auditDetail.data.action}</dd>
              <dt>Staff member</dt>
              <dd>{auditDetail.data.actorName}</dd>
              <dt>Staff ID</dt>
              <dd>{auditDetail.data.actorId ?? 'System'}</dd>
              <dt>Record</dt>
              <dd>
                {auditDetail.data.entityType} · {auditDetail.data.entityId}
              </dd>
              <dt>Date and time</dt>
              <dd>
                {new Date(auditDetail.data.createdAt).toLocaleString('en-NG', {
                  timeZone: 'Africa/Lagos',
                  dateStyle: 'full',
                  timeStyle: 'long',
                })}{' '}
                (WAT)
              </dd>
              <dt>Activity ID</dt>
              <dd>{auditDetail.data.id}</dd>
            </dl>
            <h3>Before</h3>
            <pre>{auditDetail.data.before ?? 'No previous value'}</pre>
            <h3>After</h3>
            <pre>{auditDetail.data.after ?? 'No new value'}</pre>
            <p className="lv-staff-hint">
              Passwords, codes and personal contact details are redacted.
            </p>
          </div>
        ) : (
          <p role="status">Loading activity…</p>
        )}
      </Dialog>
      {!online && (
        <StaffMessage tone="warning">
          You are offline. Last confirmed records are shown; reconnect before
          saving.
        </StaffMessage>
      )}
      {(error || access.error) && !action && (
        <StaffMessage>{error || access.error}</StaffMessage>
      )}
      {message && !action && (
        <StaffMessage tone="success">{message}</StaffMessage>
      )}
      {!access.data && !access.error && (
        <section className="lv-staff-panel" role="status">
          Loading your workspace…
        </section>
      )}
      {section === 'overview' &&
        (overview.data ? (
          <StaffOverview
            data={overview.data}
            allowedSections={navigation.map((n) => n.id)}
            onNavigate={(next) => {
              if (navigation.some((n) => n.id === next)) navigate(next);
            }}
          />
        ) : overview.error ? (
          <StaffMessage>{overview.error}</StaffMessage>
        ) : (
          <section className="lv-staff-panel" role="status">
            Loading operational summary…
          </section>
        ))}
      {section === 'pickup' && can('pickup.manage') && (
        <PickupArrivals
          arrival={arrival}
          accessToken={session.accessToken}
          deviceId={deviceId}
          online={online}
        />
      )}
      {checkInOpen && can('pickup.manage') && (
        <CheckInBuyer
          accessToken={session.accessToken}
          deviceId={deviceId}
          online={online}
          onClose={() => setCheckInOpen(false)}
          onRegistered={(visit) => {
            setArrival(visit);
            setCheckInOpen(false);
            navigate('pickup');
          }}
        />
      )}
      {section === 'support' && can('support.manage') && (
        <SupportDesk
          key={conversationId}
          initialId={conversationId}
          canReviewCancellation={can('bids.cancel')}
          session={session}
          deviceId={deviceId}
          onSession={onSession}
        />
      )}
      {section === 'auctions' && can('auctions.manage') && (
        <AuctionMerchandising {...credentials} />
      )}
      {section === 'staff' && (
        <div className="lv-staff-tabs" role="tablist" aria-label="Team records">
          {[
            ['invoices', 'Staff members'],
            ['roles', 'Roles & permissions'],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id ?? 'invoices');
                resetPages();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {section === 'finance' && (
        <div
          className="lv-staff-tabs"
          role="tablist"
          aria-label="Finance records"
        >
          {[
            ['invoices', 'Invoices & refunds'],
            ['withdrawals', 'Withdrawals'],
            ['settings', 'Fee & wallet settings'],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id ?? 'invoices');
                resetPages();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {section === 'finance' && tab === 'settings' && (
        <>
          {can('fees.manage') && (
            <AuctionFeeSettings
              accessToken={session.accessToken}
              deviceId={deviceId}
              online={online}
            />
          )}{' '}
          {can('wallet.manage') && (
            <WalletControlsSettings
              accessToken={session.accessToken}
              deviceId={deviceId}
              online={online}
            />
          )}
        </>
      )}
      {section === 'trash' && (
        <div
          className="lv-staff-tabs"
          role="tablist"
          aria-label="Archived record type"
        >
          {(['lots', 'buyers', 'staff', 'roles'] as const)
            .filter((k) => k === 'lots' || can('staff.manage'))
            .map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={trashKind === k}
                onClick={() => {
                  setTrashKind(k);
                  resetPages();
                }}
              >
                {k === 'lots'
                  ? 'Inventory'
                  : k === 'buyers'
                    ? 'Buyers'
                    : k === 'staff'
                      ? 'Staff accounts'
                      : 'Custom roles'}
              </button>
            ))}
        </div>
      )}
      {isTable && access.data && (
        <>
          <div className="lv-staff-toolbar">
            <StaffSearch
              value={search}
              onChange={setSearch}
              onSearch={(next) => {
                if (next === query) return;
                setQuery(next);
                resetPages();
              }}
              placeholder={
                kind === 'lots'
                  ? 'Search item name or full reference'
                  : kind === 'audit'
                    ? 'Search staff name, action or record ID'
                    : kind === 'invoices'
                      ? 'Search invoice reference'
                      : kind === 'withdrawals'
                        ? 'Search transfer reference'
                        : 'Search name'
              }
            />
            {['lots', 'invoices', 'withdrawals', 'buyers', 'staff'].includes(
              kind,
            ) && (
              <select
                aria-label="Filter status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  resetPages();
                }}
              >
                <option value="">All statuses</option>
                {(kind === 'lots'
                  ? [
                      'draft',
                      'scheduled',
                      'open',
                      'closing',
                      'closed',
                      'cancelled',
                    ]
                  : kind === 'invoices'
                    ? ['paid', 'pending', 'refunded']
                    : kind === 'withdrawals'
                      ? [
                          'review',
                          'queued',
                          'processing',
                          'pending',
                          'success',
                          'failed',
                          'cancelled',
                        ]
                      : ['active', 'suspended']
                ).map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            )}
          </div>
          {records.error && <StaffMessage>{records.error}</StaffMessage>}
          {!records.data && !records.error ? (
            <section className="lv-staff-panel" role="status">
              Loading records…
            </section>
          ) : records.data?.items.length === 0 ? (
            <section className="lv-staff-panel lv-staff-empty">
              <h3>No matching records</h3>
              <p>
                {query || status
                  ? 'Try another search or remove the status filter.'
                  : 'New records will appear here as your team works.'}
              </p>
            </section>
          ) : (
            records.data && (
              <div className="lv-staff-table-wrap">
                <table className="lv-staff-table">
                  <thead>
                    <tr>
                      <th>
                        {kind === 'lots'
                          ? 'Item'
                          : kind === 'audit'
                            ? 'Action'
                            : 'Record'}
                      </th>
                      <th>{kind === 'audit' ? 'Record type' : 'Status'}</th>
                      <th>
                        {['invoices', 'withdrawals', 'lots'].includes(kind)
                          ? 'Amount'
                          : kind === 'audit'
                            ? 'Staff member'
                            : 'Details'}
                      </th>
                      <th>Updated (WAT)</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.data.items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="lv-staff-record">
                            {row.imageUrl && (
                              <img
                                src={row.imageUrl}
                                alt=""
                                width={48}
                                height={48}
                              />
                            )}
                            <div>
                              <strong>{row.title}</strong>
                              <small>{row.reference}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StaffBadge status={row.status} />
                        </td>
                        <td>
                          {row.amountKobo !== undefined ? (
                            <>
                              <strong className="lv-staff-amount">
                                {formatNaira(row.amountKobo)}
                              </strong>
                              <div>
                                <small>{row.detail}</small>
                              </div>
                            </>
                          ) : (
                            row.detail
                          )}
                        </td>
                        <td>
                          {new Date(row.updatedAt).toLocaleString('en-NG', {
                            timeZone: 'Africa/Lagos',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td>
                          <div className="lv-staff-row-actions">
                            {section === 'trash' ? (
                              <>
                                <Button
                                  size="small"
                                  onClick={() =>
                                    open({
                                      kind: 'archive',
                                      row,
                                      operation: 'restore',
                                    })
                                  }
                                >
                                  Restore
                                </Button>
                                {can('records.purge') &&
                                  ((kind === 'lots' &&
                                    row.status === 'draft') ||
                                    (kind === 'roles' &&
                                      row.status === 'Custom role')) && (
                                    <Button
                                      size="small"
                                      variant="danger"
                                      onClick={() =>
                                        open({
                                          kind: 'archive',
                                          row,
                                          operation: 'purge',
                                        })
                                      }
                                    >
                                      Delete permanently
                                    </Button>
                                  )}
                              </>
                            ) : (
                              <>
                                {kind === 'audit' && (
                                  <Button
                                    size="small"
                                    onClick={() => setAuditId(row.id)}
                                  >
                                    View changes
                                  </Button>
                                )}
                                {['staff', 'buyers'].includes(kind) &&
                                  row.id !== owner &&
                                  can('staff.manage') &&
                                  can('records.archive') && (
                                    <Button
                                      size="small"
                                      variant="secondary"
                                      onClick={() =>
                                        open({
                                          kind: 'archive',
                                          row,
                                          operation: 'archive',
                                        })
                                      }
                                    >
                                      Archive
                                    </Button>
                                  )}
                                {kind === 'lots' &&
                                  row.status === 'draft' &&
                                  can('inventory.write') && (
                                    <Button
                                      size="small"
                                      onClick={() =>
                                        open({ kind: 'intake', row })
                                      }
                                    >
                                      Edit draft
                                    </Button>
                                  )}
                                {kind === 'lots' &&
                                  ['draft', 'closed', 'cancelled'].includes(
                                    row.status,
                                  ) &&
                                  can('records.archive') && (
                                    <Button
                                      size="small"
                                      variant="secondary"
                                      onClick={() =>
                                        open({
                                          kind: 'archive',
                                          row,
                                          operation: 'archive',
                                        })
                                      }
                                    >
                                      Archive
                                    </Button>
                                  )}
                                {kind === 'roles' &&
                                  row.reference !== 'admin' && (
                                    <Button
                                      size="small"
                                      onClick={() =>
                                        open({ kind: 'role', row })
                                      }
                                    >
                                      Edit permissions
                                    </Button>
                                  )}
                                {kind === 'roles' &&
                                  row.status === 'Custom role' && (
                                    <Button
                                      size="small"
                                      variant="secondary"
                                      onClick={() =>
                                        open({
                                          kind: 'archive',
                                          row,
                                          operation: 'archive',
                                        })
                                      }
                                    >
                                      Archive
                                    </Button>
                                  )}
                                {kind === 'staff' && (
                                  <>
                                    <Button
                                      size="small"
                                      onClick={() =>
                                        open({ kind: 'assign', row })
                                      }
                                    >
                                      Change role
                                    </Button>
                                    {row.id !== owner && (
                                      <Button
                                        size="small"
                                        variant="danger"
                                        onClick={() =>
                                          open({
                                            kind: 'buyer',
                                            row,
                                            operation:
                                              row.status === 'active'
                                                ? 'suspend'
                                                : 'activate',
                                          })
                                        }
                                      >
                                        {row.status === 'active'
                                          ? 'Suspend'
                                          : 'Activate'}
                                      </Button>
                                    )}
                                  </>
                                )}
                                {kind === 'buyers' && can('buyers.manage') && (
                                  <>
                                    <Button
                                      size="small"
                                      variant={
                                        row.status === 'active'
                                          ? 'danger'
                                          : 'primary'
                                      }
                                      onClick={() =>
                                        open({
                                          kind: 'buyer',
                                          row,
                                          operation:
                                            row.status === 'active'
                                              ? 'suspend'
                                              : 'activate',
                                        })
                                      }
                                    >
                                      {row.status === 'active'
                                        ? 'Suspend'
                                        : 'Activate'}
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="secondary"
                                      onClick={() =>
                                        open({
                                          kind: 'buyer',
                                          row,
                                          operation: 'strike',
                                        })
                                      }
                                    >
                                      Add strike
                                    </Button>
                                  </>
                                )}
                                {kind === 'invoices' &&
                                  row.status === 'paid' &&
                                  can('refunds.manage') && (
                                    <Button
                                      size="small"
                                      variant="danger"
                                      onClick={() =>
                                        open({ kind: 'refund', row })
                                      }
                                    >
                                      Refund to wallet
                                    </Button>
                                  )}
                                {kind === 'withdrawals' &&
                                  row.status === 'review' &&
                                  can('withdrawals.manage') && (
                                    <>
                                      <Button
                                        size="small"
                                        variant="success"
                                        onClick={() =>
                                          open({
                                            kind: 'withdrawal',
                                            row,
                                            operation: 'approve',
                                          })
                                        }
                                      >
                                        Approve
                                      </Button>
                                      <Button
                                        size="small"
                                        variant="danger"
                                        onClick={() =>
                                          open({
                                            kind: 'withdrawal',
                                            row,
                                            operation: 'reject',
                                          })
                                        }
                                      >
                                        Reject
                                      </Button>
                                    </>
                                  )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          <nav className="lv-staff-pagination" aria-label="Record pages">
            <Button
              variant="secondary"
              disabled={!pages.length}
              onClick={() => {
                setCursor(pages.at(-1));
                setPages((p) => p.slice(0, -1));
              }}
            >
              Previous
            </Button>
            <span>Page {pages.length + 1}</span>
            <Button
              variant="secondary"
              disabled={!records.data?.nextCursor}
              onClick={() => {
                setPages((p) => [...p, cursor]);
                setCursor(records.data?.nextCursor ?? undefined);
              }}
            >
              Next
            </Button>
          </nav>
        </>
      )}
      <Dialog
        open={!!action}
        title={
          action?.kind === 'role'
            ? action.row
              ? 'Edit role permissions'
              : 'Create a custom role'
            : action?.kind === 'invite'
              ? 'Invite a staff member'
              : action?.kind === 'assign'
                ? 'Change staff role'
                : action?.kind === 'refund'
                  ? 'Refund purchase to wallet'
                  : action?.kind === 'intake'
                    ? 'Item intake'
                    : action?.kind === 'csv'
                      ? 'Bulk CSV intake'
                      : action?.kind === 'archive'
                        ? action.operation === 'purge'
                          ? 'Permanently delete record'
                          : action.operation === 'restore'
                            ? 'Restore record'
                            : 'Archive record'
                        : action?.kind === 'withdrawal'
                          ? 'Review withdrawal'
                          : 'Review account action'
        }
        onClose={() => {
          if (!busy && !pending.current) setAction(undefined);
        }}
      >
        {action?.kind === 'intake' ? (
          <InventoryIntake
            {...credentials}
            row={action.row}
            onSaved={records.refresh}
          />
        ) : action?.kind === 'csv' ? (
          <InventoryCsv {...credentials} onSaved={records.refresh} />
        ) : (
          <div className="lv-staff-form">
            {error && <StaffMessage>{error}</StaffMessage>}
            {message && <StaffMessage tone="success">{message}</StaffMessage>}
            {invitation ? (
              <>
                <p>
                  Send this private setup link directly to the staff member. It
                  expires in 24 hours and can be used once. Their password and
                  authenticator are set privately.
                </p>
                <p className="lv-staff-invite-link">{invitation}</p>
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(invitation)
                      .catch(() => setError('Copy the private link manually.'))
                  }
                >
                  Copy private setup link
                </Button>
              </>
            ) : (
              <>
                <fieldset disabled={busy || !!pending.current}>
                  {action?.row && (
                    <p>
                      <strong>{action.row.title}</strong>
                      <br />
                      {action.row.reference}
                    </p>
                  )}
                  {(action?.kind === 'role' || action?.kind === 'invite') && (
                    <Input
                      label={action.kind === 'role' ? 'Role name' : 'Full name'}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  )}
                  {action?.kind === 'role' && (
                    <fieldset>
                      <legend>Allowed functions</legend>
                      <div className="lv-staff-permissions">
                        {STAFF_PERMISSIONS.filter(
                          (p) => !['staff.manage', 'records.purge'].includes(p),
                        ).map((p) => (
                          <label key={p}>
                            <input
                              type="checkbox"
                              checked={permissions.includes(p)}
                              onChange={(e) =>
                                setPermissions((old) =>
                                  e.target.checked
                                    ? [...old, p]
                                    : old.filter((v) => v !== p),
                                )
                              }
                            />
                            {p.replace('.', ' · ').replaceAll('_', ' ')}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}
                  {action?.kind === 'invite' && (
                    <Input
                      label="Staff email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  )}
                  {(action?.kind === 'invite' || action?.kind === 'assign') && (
                    <label>
                      Role
                      <select
                        value={roleId}
                        onChange={(e) => setRoleId(e.target.value)}
                      >
                        <option value="">Select a role</option>
                        {roleOptions.data?.items.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {action?.kind === 'refund' && (
                    <StaffMessage tone="warning">
                      This credits {formatNaira(action.row?.amountKobo ?? 0)} to
                      the buyer’s wallet. Only paid, uncollected and unrefunded
                      purchases qualify. It does not send money to a bank or
                      card.
                    </StaffMessage>
                  )}
                  {action?.kind === 'archive' &&
                    action.operation === 'purge' && (
                      <>
                        <StaffMessage tone="warning">
                          This cannot be undone. Linked bids, payments, invoices
                          and audit history cannot be deleted.
                        </StaffMessage>
                        <Input
                          label="Type DELETE to confirm"
                          value={confirmWord}
                          onChange={(e) => setConfirmWord(e.target.value)}
                        />
                      </>
                    )}
                  <label>
                    Reason
                    <textarea
                      value={reason}
                      minLength={5}
                      maxLength={1000}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain why this action is needed."
                    />
                  </label>
                </fieldset>
                <Button
                  variant={
                    action?.kind === 'refund' ||
                    action?.operation === 'purge' ||
                    action?.operation === 'suspend'
                      ? 'danger'
                      : 'primary'
                  }
                  busy={busy}
                  disabled={
                    !online ||
                    reason.trim().length < 5 ||
                    (action?.operation === 'purge' && confirmWord !== 'DELETE')
                  }
                  onClick={() => void submit()}
                >
                  {pending.current ? 'Retry same action' : 'Confirm action'}
                </Button>
              </>
            )}
          </div>
        )}
      </Dialog>
    </StaffShell>
  );
}
function AuctionMerchandising({
  apiUrl,
  accessToken,
  deviceId,
  online,
}: {
  apiUrl: string;
  accessToken: string;
  deviceId: string;
  online: boolean;
}) {
  const [filter, setFilter] = useState('all'),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]),
    [message, setMessage] = useState('');
  const client = useMemo(
    () => createCatalogueClient(apiUrl, { accessToken, deviceId }),
    [apiUrl, accessToken, deviceId],
  );
  const read = useStaffRead(
    () =>
      client.merchandisingLots({
        limit: 10,
        cursor,
        unsoldOnly: filter === 'unsold',
      }),
    true,
    JSON.stringify([deviceId, cursor, filter]),
  );
  const update = async (work: () => Promise<unknown>) => {
    try {
      await work();
      read.refresh();
      setMessage('Auction settings saved.');
      return undefined;
    } catch (cause) {
      return errorText(cause);
    }
  };
  return (
    <>
      <div className="lv-staff-tabs" role="tablist" aria-label="Auction view">
        {[
          ['all', 'All inventory'],
          ['unsold', 'Unsold awaiting review'],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => {
              setFilter(id ?? 'all');
              setCursor(undefined);
              setPages([]);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {read.error && <StaffMessage>{read.error}</StaffMessage>}
      {message && <StaffMessage tone="success">{message}</StaffMessage>}
      {read.data ? (
        <TopDealManager
          lots={read.data.items}
          disabled={!online || !!read.error}
          onSave={(lot, isTopDeal, topDealOrder) =>
            update(() =>
              client.editTopDeal(lot.id, {
                isTopDeal,
                topDealOrder,
                expectedUpdatedAt: lot.updatedAt,
              }),
            )
          }
          onFixedPrice={(lot, fixedPriceKobo) =>
            update(() =>
              client.editFixedPrice(lot.id, {
                fixedPriceKobo,
                expectedUpdatedAt: lot.updatedAt,
              }),
            )
          }
          onRelist={(lot, autoRelistEnabled) =>
            update(() =>
              client.editAutoRelist(lot.id, {
                autoRelistEnabled,
                expectedUpdatedAt: lot.updatedAt,
              }),
            )
          }
          scheduleControl={(lot: TopDealRow) => (
            <ScheduleControl
              lot={lot}
              accessToken={accessToken}
              deviceId={deviceId}
              disabled={!online}
              onSaved={() => {
                read.refresh();
                setMessage('Auction schedule updated.');
              }}
            />
          )}
        />
      ) : (
        !read.error && <p role="status">Loading auction controls…</p>
      )}
      <nav className="lv-staff-pagination" aria-label="Auction pages">
        <Button
          disabled={!pages.length}
          variant="secondary"
          onClick={() => {
            setCursor(pages.at(-1));
            setPages((p) => p.slice(0, -1));
          }}
        >
          Previous
        </Button>
        <span>Page {pages.length + 1}</span>
        <Button
          variant="secondary"
          disabled={!read.data?.nextCursor}
          onClick={() => {
            setPages((p) => [...p, cursor]);
            setCursor(read.data?.nextCursor ?? undefined);
          }}
        >
          Next
        </Button>
      </nav>
    </>
  );
}
