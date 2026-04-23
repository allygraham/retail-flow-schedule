import { type KeyboardEvent, type ReactNode, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLeaveRequests, type LeaveRequestRow } from '@/features/leave/useLeaveRequests';
import { SOURCE_LABEL, SOURCE_TONE, STATUS_LABEL, STATUS_TONE, TYPE_LABEL, TYPE_TONE } from '@/features/leave/leaveStatus';
import { useLeaveBalance, daysBetween } from '@/features/leave/useLeaveBalance';
import { LeaveBalanceCard } from '@/features/leave/LeaveBalanceCard';
import { LeaveBalanceInline } from '@/features/leave/LeaveBalanceInline';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Badge } from '@/components/common/Badge';
import { Avatar } from '@/components/common/Avatar';
import { Modal } from '@/components/common/Modal';
import { Field, Input, Select, TextArea } from '@/components/common/Field';
import { DatePicker, parseISODate, toISODate } from '@/components/common/DatePicker';
import { EmptyState } from '@/components/common/EmptyState';
import { fmtDate, isoDate } from '@/lib/datetime';
import { leaveSchema, managementLeaveSchema } from '@/lib/validation';
import type { LeaveSource, LeaveStatus, LeaveType } from '@/types/domain';
import { toast } from 'sonner';
import s from './Leave.module.scss';

type Filter = 'pending' | 'reviewed' | 'all';
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

export default function Leave() {
  const { user, role } = useAuth();
  const { requests, loading, isMgr, employees, submit, addForEmployee, cancelOwn, review } = useLeaveRequests();
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
  });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [mgmtErr, setMgmtErr] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{ row: LeaveRequestRow; action: 'approved' | 'rejected' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [noteViewer, setNoteViewer] = useState<{ title: string; body: ReactNode } | null>(null);

  const [filter, setFilter] = useState<Filter>('pending');
  const [filters, setFilters] = useState<LeaveFilterState>(INITIAL_LEAVE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const storeOptions = useMemo(
    () => Array.from(new Set(
      requests
        .map((request) => request.primary_store?.name ?? null)
        .filter((name): name is string => Boolean(name))
    )).sort((a, b) => a.localeCompare(b)),
    [requests],
  );

  const filtered = useMemo(() => {
    let scoped = requests;

    if (isMgr) {
      if (filter === 'pending') scoped = scoped.filter(r => r.status === 'pending');
      else if (filter === 'reviewed') scoped = scoped.filter(r => r.status === 'approved' || r.status === 'rejected');
    }

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

  const pendingCount = requests.filter((request) => {
    if (request.status !== 'pending') return false;
    if (!isMgr) return true;
    if (!user) return false;
    return role === 'owner' || request.user_id !== user.id;
  }).length;
  const selectedEmployee = employees.find((employee) => employee.user_id === mgmtForm.user_id);

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

  const openLeaveDetails = (request: LeaveRequestRow) => {
    const duration = daysBetween(request.start_date, request.end_date);
    setNoteViewer({
      title: 'Leave details',
      body: (
        <div className={s.noteViewer}>
          <div className={s.detailList}>
            <div className={s.detailRow}><span>Type</span><strong>{TYPE_LABEL[request.leave_type]}</strong></div>
            <div className={s.detailRow}><span>Dates</span><strong>{fmtDate(request.start_date, 'd MMM')} → {fmtDate(request.end_date, 'd MMM yyyy')}</strong></div>
            <div className={s.detailRow}><span>Duration</span><strong>{duration} day{duration === 1 ? '' : 's'}</strong></div>
            <div className={s.detailRow}><span>Status</span><strong>{STATUS_LABEL[request.status]}</strong></div>
            <div className={s.detailRow}><span>Source</span><strong>{SOURCE_LABEL[request.source]}</strong></div>
          </div>
          <div className={s.detailBlock}>
            <span className={s.reasonLabel}>Reason</span>
            <p>{request.reason?.trim() || 'No additional details added.'}</p>
          </div>
          {request.manager_note && (
            <div className={s.detailBlock}>
              <span className={s.reasonLabel}>Manager note</span>
              <p>{request.manager_note}</p>
            </div>
          )}
          {request.review_notes && (
            <div className={s.detailBlock}>
              <span className={s.reasonLabel}>Review note</span>
              <p>{request.review_notes}</p>
            </div>
          )}
        </div>
      ),
    });
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
    // Soft warn if annual leave exceeds remaining balance.
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
    });
    setAddLeaveModal(true);
  };

  const submitManagementLeave = async () => {
    setMgmtErr(null);
    const parsed = managementLeaveSchema.safeParse({
      ...mgmtForm,
      reason: mgmtForm.reason || null,
      manager_note: mgmtForm.manager_note || null,
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

  const openNote = (title: string, body: ReactNode) => setNoteViewer({ title, body });

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <span className={s.eye}>Leave</span>
          <h1 className={s.h1}>{isMgr ? 'Leave & sickness' : 'My time off'}</h1>
          {isMgr && pendingCount > 0 && (
            <p className={s.sub}>
              <Badge tone="pending" dot>{pendingCount} pending</Badge> awaiting your review
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

      {isMgr && (
        <div className={s.tabs} role="tablist">
          {(['pending','reviewed','all'] as Filter[]).map(f => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`${s.tab} ${filter === f ? s.tabActive : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'pending' ? `Pending (${pendingCount})` : f === 'reviewed' ? 'Reviewed' : 'All'}
            </button>
          ))}
        </div>
      )}

      <Card>
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
            </div>
          )}
        </div>
      </Card>

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
            title={hasActiveFilters ? 'No leave matches those filters' : isMgr && filter === 'pending' ? 'All caught up' : 'Nothing here yet'}
            description={hasActiveFilters
              ? 'Try broadening the filters or clear them to see more leave records.'
              : isMgr && filter === 'pending'
                ? 'No requests are waiting for review.'
                : 'Submit a request to get started.'}
            action={hasActiveFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                {isMgr && <th>Employee</th>}
                {isMgr && <th>Store</th>}
                <th>Source</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Reason</th>
                <th>Submitted</th>
                <th>Status</th>
                {isMgr && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const isRowClickable = true;
                const canReviewPending = r.status === 'pending' && (!!user && (role === 'owner' || r.user_id !== user.id));
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
                      <div className={s.sourceMeta}>
                        <Badge tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</Badge>
                      </div>
                    </td>
                    <td>
                      <Badge tone={TYPE_TONE[r.leave_type]}>{TYPE_LABEL[r.leave_type]}</Badge>
                    </td>
                    <td className={s.dates}>
                      <div className={s.dateRange}>{fmtDate(r.start_date, 'd MMM')} → {fmtDate(r.end_date, 'd MMM yyyy')}</div>
                    </td>
                    <td className={s.reason} title={r.reason ?? undefined}>{r.reason ?? '—'}</td>
                    <td className={s.muted}>{fmtDate(r.created_at, 'd MMM')}</td>
                    <td>
                      <div className={s.statusStack}>
                        <Badge tone={STATUS_TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
                        <div className={s.sourceMeta}>
                          {r.source !== 'employee_request' && r.created_by_role && (
                            <Badge tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</Badge>
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
                          {r.review_notes && (r.status === 'approved' || r.status === 'rejected') && (
                            <button
                              type="button"
                              className={s.noteButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                openNote('Review note', r.review_notes ?? '');
                              }}
                            >
                              Review note
                            </button>
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
                      </div>
                    </td>
                    {isMgr && (
                      <td className={s.actions}>
                        {canReviewPending && (
                        <>
                           <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openReview(r, 'rejected'); }}>Decline</Button>
                           <Button size="sm" onClick={(event) => { event.stopPropagation(); openReview(r, 'approved'); }}>Approve</Button>
                        </>
                      )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

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

      <Modal
        open={addLeaveModal}
        onClose={() => setAddLeaveModal(false)}
        title="Add leave"
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
            <Field label="Status">
              <Input value="Approved / recorded" disabled readOnly />
            </Field>
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
          {selectedEmployee && (
            <div className={s.hintBox}>
              {selectedEmployee.full_name} will be marked unavailable immediately and any existing shifts in this range will be returned to open coverage.
            </div>
          )}
          <Field label="Reason" hint="Optional context visible in leave history">
            <TextArea
              value={mgmtForm.reason}
              onChange={e => setMgmtForm({ ...mgmtForm, reason: e.target.value })}
              placeholder="Sickness reported by phone, approved unpaid leave, annual leave added by management…"
              rows={3}
            />
          </Field>
          <Field label="Manager note" hint="Optional internal context for the record">
            <TextArea
              value={mgmtForm.manager_note}
              onChange={e => setMgmtForm({ ...mgmtForm, manager_note: e.target.value })}
              placeholder="Optional note about handover, cover needed, or how this was confirmed"
              rows={3}
            />
          </Field>
          {mgmtForm.leave_type === 'annual' && mgmtForm.user_id && (
            <LeaveBalanceInline
              userId={mgmtForm.user_id}
              pendingDays={daysBetween(mgmtForm.start_date, mgmtForm.end_date)}
            />
          )}
          <div className={s.warnBox}>
            Management-created leave skips the employee approval queue and is saved directly as approved.
          </div>
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
