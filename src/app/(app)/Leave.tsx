import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeaveRequests, type LeaveRequestRow } from '@/features/leave/useLeaveRequests';
import { SOURCE_LABEL, SOURCE_TONE, STATUS_LABEL, STATUS_TONE, TYPE_LABEL, TYPE_TONE } from '@/features/leave/leaveStatus';
import { useLeaveBalance, daysBetween } from '@/features/leave/useLeaveBalance';
import { LeaveBalanceCard } from '@/features/leave/LeaveBalanceCard';
import { LeaveBalanceInline } from '@/features/leave/LeaveBalanceInline';
import {
  SICKNESS_CATEGORY_OPTIONS,
  SICKNESS_CATEGORY_LABEL,
  SICKNESS_LIFECYCLE_OPTIONS,
  SICKNESS_LIFECYCLE_LABEL,
  SICKNESS_LIFECYCLE_TONE,
  parseSicknessMeta,
  type SicknessLifecycleStatus,
  type SicknessMeta,
} from '@/features/leave/sickness';
import { OperationalImpactCard } from '@/features/leave/OperationalImpactCard';
import { SspPanel } from '@/features/leave/SspPanel';
import { AbsenceCalendar } from '@/features/leave/AbsenceCalendar';
import { CoverageRecoveryCard } from '@/features/leave/CoverageRecoveryCard';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/Avatar';
import { Modal } from '@/components/common/Modal';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { EmptyState } from '@/components/common/EmptyState';
import { CollapsibleSection } from '@/components/common/CollapsibleSection';
import { fmtDate, isoDate } from '@/lib/datetime';
import { leaveSchema, managementLeaveSchema } from '@/lib/validation';
import type { LeaveSource, LeaveStatus, LeaveType } from '@/types/domain';
import { CalendarDays, HeartPulse, Plane, Coins, AlertCircle, Stethoscope, FileText, Briefcase, Repeat2, Activity, NotebookPen, MoreHorizontal, SlidersHorizontal, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import s from './Leave.module.scss';
import t from './Team.module.scss';

function useIsCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompact(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return compact;
}

type Filter = 'pending' | 'approved' | 'declined' | 'sickness' | 'calendar';
type FilterChip = { key: keyof LeaveFilterState; label: string };
type LeaveFilterState = {
  status: '' | LeaveStatus;
  leaveType: '' | Extract<LeaveType, 'annual' | 'sick' | 'unpaid'>;
  source: '' | LeaveSource;
  fromDate: string;
  toDate: string;
  employeeQuery: string;
  storeName: string;
};

const INITIAL_LEAVE_FILTERS: LeaveFilterState = {
  status: '',
  leaveType: '',
  source: '',
  fromDate: '',
  toDate: '',
  employeeQuery: '',
  storeName: '',
};

function TypeIcon({ type }: { type: LeaveType }) {
  if (type === 'sick') return <HeartPulse size={14} className={s.typeIcon} aria-hidden />;
  if (type === 'annual') return <Plane size={14} className={s.typeIcon} aria-hidden />;
  if (type === 'unpaid') return <Coins size={14} className={s.typeIcon} aria-hidden />;
  return <CalendarDays size={14} className={s.typeIcon} aria-hidden />;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={s.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={s.toggleTrack}><span className={s.toggleKnob} /></span>
      <span className={s.toggleLabel}>{label}</span>
    </label>
  );
}

export default function Leave() {
  const { user, role, business } = useAuth();
  const { requests, loading, isMgr, employees, submit, addForEmployee, cancelOwn, review, updateSickness } = useLeaveRequests();
  const { balance, loading: balanceLoading, reload: reloadBalance } = useLeaveBalance();

  const [requestModal, setRequestModal] = useState(false);
  const [addLeaveModal, setAddLeaveModal] = useState(false);
  const [form, setForm] = useState<any>({
    leave_type: 'annual',
    start_date: isoDate(new Date()),
    end_date: isoDate(new Date()),
    reason: '',
  });
  const [mgmtForm, setMgmtForm] = useState<any>({
    user_id: '',
    leave_type: 'sick',
    start_date: isoDate(new Date()),
    end_date: isoDate(new Date()),
    reason: '',
    manager_note: '',
    status: 'approved',
    sickness_meta: {
      category: 'cold_flu',
      self_certified: true,
      fit_note_received: false,
      work_related_injury: false,
      paid_absence: false,
      return_to_work_interview_required: false,
      return_to_work_date: '',
    } as SicknessMeta,
    lifecycle_status: 'recorded_absence' as SicknessLifecycleStatus,
  });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [mgmtErr, setMgmtErr] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ row: LeaveRequestRow; action: 'approved' | 'rejected' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [detailsRow, setDetailsRow] = useState<LeaveRequestRow | null>(null);
  const [noteViewer, setNoteViewer] = useState<{ title: string; body: ReactNode } | null>(null);

  const [filter, setFilter] = useState<Filter>(isMgr ? 'pending' : 'approved');
  const [filters, setFilters] = useState<LeaveFilterState>(INITIAL_LEAVE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isCompact = useIsCompact();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const storeOptions = useMemo(
    () => Array.from(new Set(
      requests
        .map((request) => request.primary_store?.name ?? null)
        .filter((name): name is string => Boolean(name))
    )).sort((a, b) => a.localeCompare(b)),
    [requests],
  );

  const counts = useMemo(() => {
    const visible = isMgr
      ? requests
      : requests.filter(r => r.user_id === user?.id);
    return {
      pending: visible.filter(r => r.status === 'pending' && (!isMgr || !user || role === 'owner' || r.user_id !== user.id)).length,
      approved: visible.filter(r => r.status === 'approved').length,
      declined: visible.filter(r => r.status === 'rejected').length,
      sickness: visible.filter(r => r.leave_type === 'sick').length,
    };
  }, [requests, isMgr, user, role]);

  const filtered = useMemo(() => {
    let scoped = requests;

    if (filter === 'pending') scoped = scoped.filter(r => r.status === 'pending');
    else if (filter === 'approved') scoped = scoped.filter(r => r.status === 'approved');
    else if (filter === 'declined') scoped = scoped.filter(r => r.status === 'rejected');
    else if (filter === 'sickness') scoped = scoped.filter(r => r.leave_type === 'sick');

    return scoped.filter((request) => {
      if (filters.status && request.status !== filters.status) return false;
      if (filters.leaveType && request.leave_type !== filters.leaveType) return false;
      if (filters.source && request.source !== filters.source) return false;
      if (filters.fromDate && request.end_date < filters.fromDate) return false;
      if (filters.toDate && request.start_date > filters.toDate) return false;

      if (isMgr) {
        const employeeName = request.profiles?.full_name?.toLowerCase() ?? '';
        if (filters.employeeQuery && !employeeName.includes(filters.employeeQuery.trim().toLowerCase())) return false;
        if (filters.storeName && (request.primary_store?.name ?? '') !== filters.storeName) return false;
      }

      return true;
    });
  }, [requests, filter, isMgr, filters]);

  const activeFilterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    if (filters.status) chips.push({ key: 'status', label: `Status: ${STATUS_LABEL[filters.status]}` });
    if (filters.leaveType) chips.push({ key: 'leaveType', label: `Type: ${TYPE_LABEL[filters.leaveType]}` });
    if (filters.source) chips.push({ key: 'source', label: `Source: ${SOURCE_LABEL[filters.source]}` });
    if (filters.fromDate || filters.toDate) {
      chips.push({
        key: 'fromDate',
        label: `Dates: ${filters.fromDate ? fmtDate(filters.fromDate, 'd MMM yyyy') : 'Any'} → ${filters.toDate ? fmtDate(filters.toDate, 'd MMM yyyy') : 'Any'}`,
      });
    }
    if (isMgr && filters.employeeQuery) chips.push({ key: 'employeeQuery', label: `Employee: ${filters.employeeQuery.trim()}` });
    if (isMgr && filters.storeName) chips.push({ key: 'storeName', label: `Store: ${filters.storeName}` });
    return chips;
  }, [filters, isMgr]);

  const hasActiveFilters = activeFilterChips.length > 0;

  const selectedEmployee = employees.find((employee) => employee.user_id === mgmtForm.user_id);
  const isSicknessForm = mgmtForm.leave_type === 'sick';

  const setLeaveFilter = <K extends keyof LeaveFilterState>(key: K, value: LeaveFilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => setFilters(INITIAL_LEAVE_FILTERS);

  const clearFilterChip = (key: keyof LeaveFilterState) => {
    if (key === 'fromDate' || key === 'toDate') {
      setFilters((current) => ({ ...current, fromDate: '', toDate: '' }));
      return;
    }
    setLeaveFilter(key as never, INITIAL_LEAVE_FILTERS[key] as never);
  };

  const upcomingLeave = useMemo(() => {
    if (isMgr || !user) return { state: 'empty' as const, request: null };

    const today = isoDate(new Date());
    const approved = requests
      .filter((request) => request.user_id === user.id && request.status === 'approved' && request.end_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));

    const current = approved.find((request) => request.start_date <= today && request.end_date >= today);
    if (current) return { state: 'current' as const, request: current };

    const next = approved.find((request) => request.start_date >= today) ?? null;
    if (next) return { state: 'upcoming' as const, request: next };

    return { state: 'empty' as const, request: null };
  }, [isMgr, requests, user]);

  // Linked sickness detection — helper text only.
  const detectLinkedSickness = (row: LeaveRequestRow): boolean => {
    if (row.leave_type !== 'sick') return false;
    const window = 56; // 8 weeks
    const start = new Date(row.start_date + 'T00:00:00').getTime();
    return requests.some(other => {
      if (other.id === row.id) return false;
      if (other.user_id !== row.user_id) return false;
      if (other.leave_type !== 'sick') return false;
      const end = new Date(other.end_date + 'T00:00:00').getTime();
      if (end >= start) return false;
      const gap = (start - end) / (1000 * 60 * 60 * 24);
      return gap <= window;
    });
  };

  const openLeaveDetails = (request: LeaveRequestRow) => {
    setDetailsRow(request);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, request: LeaveRequestRow) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLeaveDetails(request);
    }
  };

  const submitRequest = async () => {
    setFormErr(null);
    const parsed = leaveSchema.safeParse(form);
    if (!parsed.success) { setFormErr(parsed.error.issues[0].message); return; }
    if (parsed.data.leave_type === 'annual' && balance) {
      const days = daysBetween(parsed.data.start_date, parsed.data.end_date);
      if (days > balance.remaining) {
        const ok = window.confirm(
          `This request is ${days} day${days === 1 ? '' : 's'} but you only have ${balance.remaining} day${balance.remaining === 1 ? '' : 's'} of annual leave remaining. Submit anyway?`
        );
        if (!ok) return;
      }
    }
    try {
      await submit(parsed.data);
      setRequestModal(false);
      setForm({ leave_type: 'annual', start_date: isoDate(new Date()), end_date: isoDate(new Date()), reason: '' });
      toast.success('Request submitted. Your manager has been notified.');
      reloadBalance();
    } catch (e: any) {
      setFormErr(e.message ?? 'Could not submit');
    }
  };

  const openAddLeave = (userId?: string) => {
    setMgmtErr(null);
    setMgmtForm({
      user_id: userId ?? employees[0]?.user_id ?? '',
      leave_type: 'sick',
      start_date: isoDate(new Date()),
      end_date: isoDate(new Date()),
      reason: '',
      manager_note: '',
      status: 'approved',
      sickness_meta: {
        category: 'cold_flu',
        self_certified: true,
        fit_note_received: false,
        work_related_injury: false,
        paid_absence: false,
        return_to_work_interview_required: false,
        return_to_work_date: '',
      },
      lifecycle_status: 'recorded_absence',
    });
    setAddLeaveModal(true);
  };

  const submitManagementLeave = async () => {
    setMgmtErr(null);
    const sickness_meta = mgmtForm.leave_type === 'sick' ? {
      ...mgmtForm.sickness_meta,
      return_to_work_date: mgmtForm.sickness_meta?.return_to_work_date || null,
    } : null;
    const parsed = managementLeaveSchema.safeParse({
      ...mgmtForm,
      reason: mgmtForm.reason || null,
      manager_note: mgmtForm.manager_note || null,
      sickness_meta,
      lifecycle_status: mgmtForm.leave_type === 'sick' ? mgmtForm.lifecycle_status : null,
    });
    if (!parsed.success) {
      setMgmtErr(parsed.error.issues[0].message);
      return;
    }

    try {
      const result = await addForEmployee(parsed.data);
      setAddLeaveModal(false);
      toast.success(
        result.conflictingShiftCount > 0
          ? `Leave recorded — ${result.conflictingShiftCount} shift${result.conflictingShiftCount === 1 ? '' : 's'} moved back to open coverage.`
          : 'Leave recorded and approved.'
      );
      reloadBalance();
    } catch (e: any) {
      setMgmtErr(e.message ?? 'Could not record leave');
    }
  };

  const openReview = (row: LeaveRequestRow, action: 'approved' | 'rejected') => {
    setReviewing({ row, action });
    setReviewNote('');
  };
  const confirmReview = async () => {
    if (!reviewing) return;
    try {
      await review({ id: reviewing.row.id, status: reviewing.action, review_notes: reviewNote.trim() || null });
      const verb = reviewing.action === 'approved' ? 'Approved' : 'Declined';
      toast.success(
        reviewing.action === 'approved'
          ? `${verb} — any clashing shifts were unassigned.`
          : verb,
      );
      setReviewing(null);
      reloadBalance();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save decision');
    }
  };

  const cancel = async (id: string) => {
    toast('Cancel this request?', {
      action: { label: 'Cancel request', onClick: async () => {
        try { await cancelOwn(id); toast.success('Request cancelled'); }
        catch (e: any) { toast.error(e.message ?? 'Could not cancel'); }
      }},
      cancel: { label: 'Keep', onClick: () => {} },
    });
  };

  const updateMgmtMeta = (patch: Partial<SicknessMeta>) => {
    setMgmtForm((prev: any) => ({ ...prev, sickness_meta: { ...prev.sickness_meta, ...patch } }));
  };

  const openNote = (title: string, body: ReactNode) => setNoteViewer({ title, body });

  const tabs: { key: Filter; label: string; count?: number; show?: boolean }[] = [
    { key: 'pending', label: 'Pending', count: counts.pending, show: isMgr },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'declined', label: 'Declined', count: counts.declined },
    { key: 'sickness', label: 'Sickness', count: counts.sickness },
    { key: 'calendar', label: 'Calendar' },
  ];

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Workforce</span>
          <h1 className={s.h1}>{isMgr ? 'Leave & absence' : 'My time off'}</h1>
          {isMgr && counts.pending > 0 && (
            <p className={s.sub}>
              <Badge tone="pending" dot>{counts.pending} pending</Badge> awaiting your review
            </p>
          )}
        </div>
        <div className={s.headerActions}>
          {isMgr ? (
            <Button onClick={() => openAddLeave()}>Add leave</Button>
          ) : (
            <Button onClick={() => setRequestModal(true)}>Request time off</Button>
          )}
        </div>
      </header>

      {!isMgr && (
        <LeaveBalanceCard balance={balance} loading={balanceLoading} />
      )}

      {!isMgr && (
        <Card>
          <div className={s.upcomingSummary}>
            <div>
              <div className={s.upcomingEyebrow}>Upcoming leave</div>
              {upcomingLeave.request ? (
                <>
                  <div className={s.upcomingTitle}>
                    {upcomingLeave.state === 'current' ? 'Currently on leave' : TYPE_LABEL[upcomingLeave.request.leave_type]}
                  </div>
                  <div className={s.upcomingMeta}>
                    {fmtDate(upcomingLeave.request.start_date, 'd MMM')} → {fmtDate(upcomingLeave.request.end_date, 'd MMM yyyy')}
                    <span className={s.upcomingPill}>{daysBetween(upcomingLeave.request.start_date, upcomingLeave.request.end_date)} day{daysBetween(upcomingLeave.request.start_date, upcomingLeave.request.end_date) === 1 ? '' : 's'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className={s.upcomingTitle}>No upcoming leave</div>
                  <div className={s.upcomingMeta}>Your next approved time off will appear here.</div>
                </>
              )}
            </div>
            {upcomingLeave.request ? (
              <div className={s.rowMeta}>
                <Badge tone={TYPE_TONE[upcomingLeave.request.leave_type]}>{TYPE_LABEL[upcomingLeave.request.leave_type]}</Badge>
                <Badge tone={STATUS_TONE[upcomingLeave.request.status]} dot>{STATUS_LABEL[upcomingLeave.request.status]}</Badge>
              </div>
            ) : null}
          </div>
        </Card>
      )}

      <div className={s.tabs} role="tablist">
        {tabs.filter(t => t.show !== false).map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            className={`${s.tab} ${filter === t.key ? s.tabActive : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {filter !== 'calendar' && (() => {
        const filterFields = (
          <>
            <Field label="Status">
              <Select value={filters.status} onChange={(e) => setLeaveFilter('status', e.target.value as LeaveFilterState['status'])}>
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Declined</option>
              </Select>
            </Field>

            <Field label="Leave type">
              <Select value={filters.leaveType} onChange={(e) => setLeaveFilter('leaveType', e.target.value as LeaveFilterState['leaveType'])}>
                <option value="">All leave types</option>
                <option value="annual">Annual leave</option>
                <option value="sick">Sick leave</option>
                <option value="unpaid">Unpaid leave</option>
              </Select>
            </Field>

            <Field label="From date">
              <DatePicker
                value={parseISODate(filters.fromDate)}
                onChange={(date) => setLeaveFilter('fromDate', toISODate(date) || '')}
                placeholder="Any start date"
              />
            </Field>

            <Field label="To date">
              <DatePicker
                value={parseISODate(filters.toDate)}
                onChange={(date) => setLeaveFilter('toDate', toISODate(date) || '')}
                placeholder="Any end date"
              />
            </Field>

            <Field label="Source">
              <Select value={filters.source} onChange={(e) => setLeaveFilter('source', e.target.value as LeaveFilterState['source'])}>
                <option value="">All sources</option>
                <option value="employee_request">Employee requested</option>
                <option value="manager_created">Manager created</option>
                <option value="owner_created">Owner created</option>
              </Select>
            </Field>

            {isMgr && (
              <Field label="Employee name">
                <Input
                  value={filters.employeeQuery}
                  onChange={(e) => setLeaveFilter('employeeQuery', e.target.value)}
                  placeholder="Search employee"
                />
              </Field>
            )}

            {isMgr && (
              <Field label="Store / location">
                <Select value={filters.storeName} onChange={(e) => setLeaveFilter('storeName', e.target.value)}>
                  <option value="">All stores</option>
                  {storeOptions.map((storeName) => (
                    <option key={storeName} value={storeName}>{storeName}</option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        );

        const activeNonSearchCount = activeFilterChips.filter(c => c.key !== 'employeeQuery').length;

        return (
          <Card>
            {isCompact ? (
              <div className={s.filterBar}>
                <div className={t.mobileFilterBar}>
                  {isMgr ? (
                    <Input
                      className={t.searchInline}
                      placeholder="Search employee…"
                      value={filters.employeeQuery}
                      onChange={(e) => setLeaveFilter('employeeQuery', e.target.value)}
                    />
                  ) : (
                    <span className={t.searchInline} />
                  )}
                  <button
                    type="button"
                    className={t.filterBtn}
                    onClick={() => setFilterSheetOpen(true)}
                    aria-label="Open filters"
                  >
                    <SlidersHorizontal size={15} />
                    Filters
                    {activeNonSearchCount > 0 && (
                      <span className={t.filterBtnCount}>{activeNonSearchCount}</span>
                    )}
                  </button>
                </div>
                {hasActiveFilters && (
                  <div className={t.chipsRow}>
                    {activeFilterChips.map((chip) => (
                      <span key={chip.label} className={t.chip}>
                        {chip.label}
                        <button
                          type="button"
                          className={t.chipX}
                          onClick={() => clearFilterChip(chip.key)}
                          aria-label={`Remove ${chip.label}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <button type="button" className={t.clearAll} onClick={clearFilters}>
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className={s.filterBar}>
                <div className={s.filterFooter}>
                  <div className={s.filterSummary}>
                    {hasActiveFilters ? (
                      activeFilterChips.map((chip) => (
                        <button key={chip.label} type="button" className={s.filterChip} onClick={() => clearFilterChip(chip.key)}>
                          <span>{chip.label}</span>
                          <span aria-hidden="true">×</span>
                        </button>
                      ))
                    ) : (
                      <span className={s.filterHint}>No filters applied</span>
                    )}
                  </div>
                  <div className={s.filterActions}>
                    <Button variant="outline" onClick={() => setFiltersOpen((open) => !open)}>
                      {filtersOpen ? 'Hide filters' : 'Show filters'}
                    </Button>
                    <Button variant="ghost" onClick={clearFilters} disabled={!hasActiveFilters}>Clear filters</Button>
                  </div>
                </div>

                {filtersOpen && (
                  <div className={s.filterGrid}>
                    {filterFields}
                  </div>
                )}
              </div>
            )}

            <Modal
              open={filterSheetOpen}
              onClose={() => setFilterSheetOpen(false)}
              title="Filters"
              bottomSheet
              footer={
                <>
                  <Button variant="ghost" onClick={clearFilters} disabled={!hasActiveFilters}>Reset</Button>
                  <Button onClick={() => setFilterSheetOpen(false)}>Apply</Button>
                </>
              }
            >
              <div className={t.sheetForm}>
                {filterFields}
              </div>
            </Modal>
          </Card>
        );
      })()}


      {filter === 'calendar' ? (
        <Card padded={false}>
          <AbsenceCalendar requests={requests} onSelectRequest={(r) => openLeaveDetails(r)} />
        </Card>
      ) : (
        <Card padded={false}>
          {hasActiveFilters && (
            <div className={s.activeFiltersRow}>
              {activeFilterChips.map((chip) => (
                <button key={`table-${chip.label}`} type="button" className={s.filterChip} onClick={() => clearFilterChip(chip.key)}>
                  <span>{chip.label}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
          {loading ? (
            <div className={s.loading}>Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? 'No leave & absence matches those filters' : isMgr && filter === 'pending' ? 'All caught up' : 'Nothing here yet'}
              description={hasActiveFilters
                ? 'Try broadening the filters or clear them to see more absence records.'
                : isMgr && filter === 'pending'
                  ? 'No requests are waiting for review.'
                  : filter === 'sickness'
                    ? 'No sickness has been recorded yet.'
                    : 'Submit a request to get started.'}
              action={hasActiveFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
            />
          ) : (() => {
            const hasAnyActions = isMgr && filtered.some(r => r.status === 'pending' && (!!user && (role === 'owner' || r.user_id !== user.id)));
            return (
            <div className={s.tableWrap}><table className={s.table}>
              <thead>
                <tr>
                  {isMgr && <th>Employee</th>}
                  {isMgr && <th>Store</th>}
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Operational impact</th>
                  <th>Submitted</th>
                  {hasAnyActions && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isRowClickable = true;
                  const canReviewPending = r.status === 'pending' && (!!user && (role === 'owner' || r.user_id !== user.id));
                  const meta = parseSicknessMeta(r.sickness_meta);
                  const isSick = r.leave_type === 'sick';
                  const linked = isSick && detectLinkedSickness(r);
                  const lifecycle = r.lifecycle_status as SicknessLifecycleStatus | null;
                  return (
                    <tr
                      key={r.id}
                      className={isRowClickable ? s.clickableRow : undefined}
                      onClick={isRowClickable ? () => openLeaveDetails(r) : undefined}
                      onKeyDown={isRowClickable ? (event) => onRowKeyDown(event, r) : undefined}
                      tabIndex={isRowClickable ? 0 : undefined}
                      aria-label={isRowClickable ? `Open details for ${TYPE_LABEL[r.leave_type]} leave from ${fmtDate(r.start_date, 'd MMM')} to ${fmtDate(r.end_date, 'd MMM yyyy')}` : undefined}
                    >
                      {isMgr && (
                        <td>
                          <div className={s.who}>
                            <Avatar name={r.profiles?.full_name ?? undefined} size="sm" />
                            <span>{r.profiles?.full_name ?? 'Employee'}</span>
                          </div>
                        </td>
                      )}
                      {isMgr && <td className={s.muted}>{r.primary_store?.name ?? '—'}</td>}
                      <td>
                        <div className={s.typeCell}>
                          <Badge tone={TYPE_TONE[r.leave_type]}>
                            <TypeIcon type={r.leave_type} />
                            {TYPE_LABEL[r.leave_type]}
                          </Badge>
                          {isSick && meta.category && (
                            <span className={s.muted}>{SICKNESS_CATEGORY_LABEL[meta.category]}</span>
                          )}
                        </div>
                      </td>
                      <td className={s.dates}>
                        <div className={s.dateRange}>{fmtDate(r.start_date, 'd MMM')} → {fmtDate(r.end_date, 'd MMM yyyy')}</div>
                        <div className={s.muted}>{daysBetween(r.start_date, r.end_date)} day{daysBetween(r.start_date, r.end_date) === 1 ? '' : 's'}</div>
                      </td>
                      <td>
                        <div className={s.statusStack}>
                          {isSick ? (
                            <Badge tone={lifecycle ? SICKNESS_LIFECYCLE_TONE[lifecycle] : 'info'} dot>
                              {lifecycle ? SICKNESS_LIFECYCLE_LABEL[lifecycle] : 'Recorded absence'}
                            </Badge>
                          ) : (
                            <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
                          )}
                          {isSick && (
                            <div className={s.indicatorRow}>
                              {meta.self_certified && <span className={s.indicator}>Self-cert</span>}
                              {meta.fit_note_received && <span className={s.indicator}>Fit note</span>}
                              {meta.return_to_work_interview_required && <span className={s.indicator}>RTW</span>}
                              {meta.paid_absence === true && <span className={s.indicator}>Paid</span>}
                              {meta.paid_absence === false && <span className={s.indicator}>Unpaid</span>}
                            </div>
                          )}
                          {linked && (
                            <span className={s.linkedHint}>
                              <AlertCircle size={12} /> Linked to recent sickness
                            </span>
                          )}
                          {!isMgr && r.status === 'pending' && (
                            <button
                              type="button"
                              className={s.noteButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                cancel(r.id);
                              }}
                            >
                              Withdraw request
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={s.impactCell}>
                          <Badge tone={r.source === 'employee_request' ? 'neutral' : SOURCE_TONE[r.source]}>
                            {SOURCE_LABEL[r.source]}
                          </Badge>
                          {r.status === 'approved' && (
                            <span className={s.muted}>Shifts returned to open coverage</span>
                          )}
                          {r.manager_note && (
                            <button
                              type="button"
                              className={s.noteButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                openNote('Manager note', r.manager_note ?? '');
                              }}
                            >
                              Manager note
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={s.muted}>{fmtDate(r.created_at, 'd MMM')}</td>
                      {hasAnyActions && (
                        <td className={s.actions}>
                          {canReviewPending ? (
                            <div className={s.actionsInner} onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className={s.menuTrigger}
                                    aria-label="Open actions"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className={s.menuContent}>
                                  <DropdownMenuItem onSelect={() => openReview(r, 'approved')}>Approve</DropdownMenuItem>
                                  <DropdownMenuItem className={s.menuDanger} onSelect={() => openReview(r, 'rejected')}>Decline</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : (
                            <span className={s.actionsEmpty} aria-hidden>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            );
          })()}
        </Card>
      )}

      {/* Request modal */}
      <Modal
        open={requestModal}
        onClose={() => setRequestModal(false)}
        title="Request time off"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequestModal(false)}>Cancel</Button>
            <Button onClick={submitRequest}>Submit</Button>
          </>
        }
      >
        <div className={s.form}>
          <Field label="Type">
            <Select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}>
              <option value="annual">Annual leave</option>
              <option value="unpaid">Unpaid</option>
              <option value="sick">Sick</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Dates">
            <DatePicker
              mode="range"
              value={{ from: parseISODate(form.start_date), to: parseISODate(form.end_date) }}
              onChange={(r) => setForm({
                ...form,
                start_date: toISODate(r.from) || form.start_date,
                end_date: toISODate(r.to) || toISODate(r.from) || form.end_date,
              })}
              placeholder="Pick a date range"
            />
          </Field>
          <Field label="Reason">
            <TextArea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="Optional context for your manager"
              rows={3}
            />
          </Field>
          {formErr && <div className={s.err}>{formErr}</div>}
        </div>
      </Modal>

      {/* Add leave / record absence modal */}
      <Modal
        open={addLeaveModal}
        onClose={() => setAddLeaveModal(false)}
        title="Add leave or absence"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddLeaveModal(false)}>Cancel</Button>
            <Button onClick={submitManagementLeave}>Save as approved</Button>
          </>
        }
      >
        <div className={s.form}>
          <Field label="Employee">
            <Select value={mgmtForm.user_id} onChange={e => setMgmtForm({ ...mgmtForm, user_id: e.target.value })}>
              <option value="">Select employee…</option>
              {employees.map((employee) => (
                <option key={employee.user_id} value={employee.user_id}>
                  {employee.full_name}{employee.primary_store_name ? ` · ${employee.primary_store_name}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className={s.row2}>
            <Field label="Leave type">
              <Select value={mgmtForm.leave_type} onChange={e => setMgmtForm({ ...mgmtForm, leave_type: e.target.value })}>
                <option value="annual">Annual leave</option>
                <option value="sick">Sick leave</option>
                <option value="unpaid">Unpaid leave</option>
              </Select>
            </Field>
            {isSicknessForm ? (
              <Field label="Sickness status">
                <Select
                  value={mgmtForm.lifecycle_status}
                  onChange={e => setMgmtForm({ ...mgmtForm, lifecycle_status: e.target.value })}
                >
                  {SICKNESS_LIFECYCLE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Status">
                <Input value="Approved / recorded" disabled readOnly />
              </Field>
            )}
          </div>
          <Field label="Dates">
            <DatePicker
              mode="range"
              value={{ from: parseISODate(mgmtForm.start_date), to: parseISODate(mgmtForm.end_date) }}
              onChange={(r) => setMgmtForm({
                ...mgmtForm,
                start_date: toISODate(r.from) || mgmtForm.start_date,
                end_date: toISODate(r.to) || toISODate(r.from) || mgmtForm.end_date,
              })}
              placeholder="Pick a date range"
            />
          </Field>

          {isSicknessForm && (
            <CollapsibleSection
              title="Sickness details"
              icon={<Stethoscope size={14} />}
              meta={SICKNESS_CATEGORY_LABEL[(mgmtForm.sickness_meta?.category ?? 'cold_flu') as keyof typeof SICKNESS_CATEGORY_LABEL]}
            >
              <div className={s.form}>
                <div className={s.row2}>
                  <Field label="Category">
                    <Select
                      value={mgmtForm.sickness_meta?.category ?? 'cold_flu'}
                      onChange={e => updateMgmtMeta({ category: e.target.value as any })}
                    >
                      {SICKNESS_CATEGORY_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Return-to-work date" hint="Optional">
                    <DatePicker
                      value={parseISODate(mgmtForm.sickness_meta?.return_to_work_date ?? '')}
                      onChange={(d) => updateMgmtMeta({ return_to_work_date: toISODate(d) ?? '' })}
                      placeholder="Expected back"
                    />
                  </Field>
                </div>

                <div className={s.toggleGroup}>
                  <div className={s.toggleGroupLabel}><FileText size={12} /> Documentation</div>
                  <div className={s.toggleGrid}>
                    <Toggle checked={!!mgmtForm.sickness_meta?.self_certified} onChange={(v) => updateMgmtMeta({ self_certified: v })} label="Self-certified" />
                    <Toggle checked={!!mgmtForm.sickness_meta?.fit_note_received} onChange={(v) => updateMgmtMeta({ fit_note_received: v })} label="Fit note received" />
                  </div>
                </div>
                <div className={s.toggleGroup}>
                  <div className={s.toggleGroupLabel}><Briefcase size={12} /> Employment</div>
                  <div className={s.toggleGrid}>
                    <Toggle checked={!!mgmtForm.sickness_meta?.paid_absence} onChange={(v) => updateMgmtMeta({ paid_absence: v })} label="Paid absence" />
                    <Toggle checked={!!mgmtForm.sickness_meta?.work_related_injury} onChange={(v) => updateMgmtMeta({ work_related_injury: v })} label="Work-related injury" />
                  </div>
                </div>
                <div className={s.toggleGroup}>
                  <div className={s.toggleGroupLabel}><Repeat2 size={12} /> Follow-up</div>
                  <div className={s.toggleGrid}>
                    <Toggle checked={!!mgmtForm.sickness_meta?.return_to_work_interview_required} onChange={(v) => updateMgmtMeta({ return_to_work_interview_required: v })} label="Return-to-work interview required" />
                  </div>
                </div>

                {mgmtForm.user_id && (() => {
                  const window = 56;
                  const start = new Date(mgmtForm.start_date + 'T00:00:00').getTime();
                  const hasLinked = requests.some(other => {
                    if (other.user_id !== mgmtForm.user_id) return false;
                    if (other.leave_type !== 'sick') return false;
                    const end = new Date(other.end_date + 'T00:00:00').getTime();
                    if (end >= start) return false;
                    const gap = (start - end) / (1000 * 60 * 60 * 24);
                    return gap <= window;
                  });
                  return hasLinked ? (
                    <p className={s.hintText}><AlertCircle size={12} /> May link to a recent sickness period (last 8 weeks).</p>
                  ) : null;
                })()}
              </div>
            </CollapsibleSection>
          )}

          {selectedEmployee && (
            <CollapsibleSection
              title="Operational impact"
              icon={<Activity size={14} />}
              tone="subtle"
              meta="Affected shifts & open cover"
            >
              <OperationalImpactCard
                userId={mgmtForm.user_id}
                startDate={mgmtForm.start_date}
                endDate={mgmtForm.end_date}
              />
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Internal notes"
            icon={<NotebookPen size={14} />}
            tone="subtle"
            meta="Reason · manager note"
          >
            <div className={s.form}>
              <Field label="Reason" hint="Visible in absence history">
                <TextArea
                  value={mgmtForm.reason}
                  onChange={e => setMgmtForm({ ...mgmtForm, reason: e.target.value })}
                  placeholder="Sickness reported by phone, approved unpaid leave…"
                  rows={2}
                />
              </Field>
              <Field label="Manager note" hint="Internal context only">
                <TextArea
                  value={mgmtForm.manager_note}
                  onChange={e => setMgmtForm({ ...mgmtForm, manager_note: e.target.value })}
                  placeholder="Handover, cover needed, how this was confirmed…"
                  rows={2}
                />
              </Field>
            </div>
          </CollapsibleSection>

          {mgmtForm.leave_type === 'annual' && mgmtForm.user_id && (
            <LeaveBalanceInline
              userId={mgmtForm.user_id}
              pendingDays={daysBetween(mgmtForm.start_date, mgmtForm.end_date)}
            />
          )}
          {mgmtErr && <div className={s.err}>{mgmtErr}</div>}
        </div>
      </Modal>

      {/* Review modal */}
      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={reviewing?.action === 'approved' ? 'Approve request' : 'Decline request'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button
              variant={reviewing?.action === 'approved' ? 'primary' : 'danger'}
              onClick={confirmReview}
            >
              {reviewing?.action === 'approved' ? 'Approve' : 'Decline'}
            </Button>
          </>
        }
      >
        {reviewing && (
          <div className={s.form}>
            <div className={s.reviewSummary}>
              <Avatar name={reviewing.row.profiles?.full_name ?? undefined} size="sm" />
              <div>
                <div className={s.reviewName}>{reviewing.row.profiles?.full_name ?? 'Employee'}</div>
                <div className={s.muted}>
                  {TYPE_LABEL[reviewing.row.leave_type]} ·{' '}
                  {fmtDate(reviewing.row.start_date, 'd MMM')} → {fmtDate(reviewing.row.end_date, 'd MMM yyyy')}
                </div>
              </div>
            </div>
            {reviewing.row.leave_type === 'annual' && (
              <LeaveBalanceInline
                userId={reviewing.row.user_id}
                pendingDays={daysBetween(reviewing.row.start_date, reviewing.row.end_date)}
              />
            )}
            {reviewing.row.reason && (
              <div className={s.reviewReason}>
                <span className={s.reasonLabel}>Reason</span>
                <p>{reviewing.row.reason}</p>
              </div>
            )}
            <Field
              label="Note to employee (optional)"
              hint={reviewing.action === 'approved'
                ? 'Approving will unassign any of their shifts in this date range.'
                : 'Briefly explain your decision so the employee has context.'}
            >
              <TextArea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={reviewing.action === 'approved' ? 'Enjoy your time off!' : 'Sorry — store is short-staffed that week.'}
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Details viewer */}
      <Modal
        open={!!detailsRow}
        onClose={() => setDetailsRow(null)}
        title="Absence details"
        size="lg"
        footer={
          <>
            {isMgr && detailsRow?.leave_type === 'sick' && (
              <Select
                value={(detailsRow.lifecycle_status as string) ?? 'recorded_absence'}
                onChange={async (e) => {
                  if (!detailsRow) return;
                  try {
                    await updateSickness(detailsRow.id, { lifecycle_status: e.target.value as any });
                    setDetailsRow({ ...detailsRow, lifecycle_status: e.target.value as any });
                    toast.success('Sickness status updated');
                  } catch (err: any) { toast.error(err.message ?? 'Could not update'); }
                }}
              >
                {SICKNESS_LIFECYCLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
            <Button onClick={() => setDetailsRow(null)}>Close</Button>
          </>
        }
      >
        {detailsRow && (() => {
          const duration = daysBetween(detailsRow.start_date, detailsRow.end_date);
          const meta = parseSicknessMeta(detailsRow.sickness_meta);
          const isSick = detailsRow.leave_type === 'sick';
          const history = requests
            .filter(r => r.user_id === detailsRow.user_id)
            .map(r => ({ start_date: r.start_date, end_date: r.end_date, leave_type: r.leave_type }));
          return (
            <div className={s.noteViewer}>
              <div className={s.detailList}>
                <div className={s.detailRow}><span>Employee</span><strong>{detailsRow.profiles?.full_name ?? 'Employee'}</strong></div>
                <div className={s.detailRow}><span>Type</span><strong>{TYPE_LABEL[detailsRow.leave_type]}</strong></div>
                <div className={s.detailRow}><span>Dates</span><strong>{fmtDate(detailsRow.start_date, 'd MMM')} → {fmtDate(detailsRow.end_date, 'd MMM yyyy')}</strong></div>
                <div className={s.detailRow}><span>Duration</span><strong>{duration} day{duration === 1 ? '' : 's'}</strong></div>
                {isSick ? (
                  <div className={s.detailRow}>
                    <span>Sickness status</span>
                    <strong>{detailsRow.lifecycle_status
                      ? SICKNESS_LIFECYCLE_LABEL[detailsRow.lifecycle_status as SicknessLifecycleStatus]
                      : 'Recorded absence'}</strong>
                  </div>
                ) : (
                  <div className={s.detailRow}><span>Status</span><strong>{STATUS_LABEL[detailsRow.status]}</strong></div>
                )}
                <div className={s.detailRow}><span>Source</span><strong>{SOURCE_LABEL[detailsRow.source]}</strong></div>
                {isSick && meta.category && (
                  <div className={s.detailRow}><span>Category</span><strong>{SICKNESS_CATEGORY_LABEL[meta.category]}</strong></div>
                )}
                {isSick && meta.return_to_work_date && (
                  <div className={s.detailRow}><span>Return to work</span><strong>{fmtDate(meta.return_to_work_date, 'd MMM yyyy')}</strong></div>
                )}
              </div>

              {isSick && (
                <div className={s.indicatorRow}>
                  {meta.self_certified && <span className={s.indicator}>Self-certified</span>}
                  {meta.fit_note_received && <span className={s.indicator}>Fit note received</span>}
                  {meta.work_related_injury && <span className={s.indicator}>Work-related injury</span>}
                  {meta.return_to_work_interview_required && <span className={s.indicator}>RTW interview required</span>}
                  {meta.paid_absence !== undefined && <span className={s.indicator}>{meta.paid_absence ? 'Paid' : 'Unpaid'}</span>}
                </div>
              )}

              {isMgr && business && (
                <CoverageRecoveryCard
                  businessId={business.id}
                  userId={detailsRow.user_id}
                  startDate={detailsRow.start_date}
                  endDate={detailsRow.end_date}
                />
              )}

              {isMgr && (
                <CollapsibleSection
                  title="Operational impact"
                  icon={<Activity size={14} />}
                  tone="subtle"
                  defaultOpen={false}
                  meta="Shifts affected · uncovered hours"
                >
                  <OperationalImpactCard
                    userId={detailsRow.user_id}
                    startDate={detailsRow.start_date}
                    endDate={detailsRow.end_date}
                  />
                </CollapsibleSection>
              )}

              {isSick && isMgr && (
                <CollapsibleSection
                  title="SSP estimate"
                  icon={<Coins size={14} />}
                  tone="subtle"
                  defaultOpen={false}
                  meta="Operational guidance"
                >
                  <SspPanel
                    startDate={detailsRow.start_date}
                    endDate={detailsRow.end_date}
                    history={history}
                    paid={meta.paid_absence}
                    employeeName={detailsRow.profiles?.full_name ?? undefined}
                  />
                </CollapsibleSection>
              )}

              {(detailsRow.reason || detailsRow.manager_note || detailsRow.review_notes) && (
                <CollapsibleSection
                  title="Notes & history"
                  icon={<NotebookPen size={14} />}
                  tone="subtle"
                  defaultOpen={false}
                >
                  <div className={s.form}>
                    {detailsRow.reason && (
                      <div className={s.detailBlock}>
                        <span className={s.reasonLabel}>Reason</span>
                        <p>{detailsRow.reason}</p>
                      </div>
                    )}
                    {detailsRow.manager_note && (
                      <div className={s.detailBlock}>
                        <span className={s.reasonLabel}>Manager note</span>
                        <p>{detailsRow.manager_note}</p>
                      </div>
                    )}
                    {detailsRow.review_notes && (
                      <div className={s.detailBlock}>
                        <span className={s.reasonLabel}>Review note</span>
                        <p>{detailsRow.review_notes}</p>
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!noteViewer}
        onClose={() => setNoteViewer(null)}
        title={noteViewer?.title ?? 'Note'}
        footer={<Button onClick={() => setNoteViewer(null)}>Close</Button>}
      >
        {noteViewer && (
          <div className={s.noteViewer}>
            {noteViewer.body}
          </div>
        )}
      </Modal>
    </div>
  );
}
