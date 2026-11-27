import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { Workspace } from '../../core/models/workspace.models';
import {
  AttendanceReport,
  FinanceReport,
  ReportCollection,
  ReportExportRequest,
  ReportService,
} from '../../core/services/report.service';
import {
  WorkspaceAvailability,
  WorkspaceService,
} from '../../core/services/workspace.service';
import { formatMoneyExact } from '../../core/utils/finance';
import { WorkspaceSelectorComponent } from '../workspace/workspace-selector.component';

type ReportFilters = {
  from?: string;
  to?: string;
  studentId?: string;
  groupId?: string;
  timezone: string;
};

type ExportContext = {
  workspaceId: string;
  revision: number;
  type: 'attendance' | 'finance';
  filters: ReportFilters;
};

type ExportResult =
  | { type: 'attendance'; report: AttendanceReport }
  | { type: 'finance'; report: FinanceReport };

type ReportPagination = AttendanceReport['pagination'];

interface ReportCollectionState<T> {
  items: T[];
  pagination: ReportPagination;
  loading: boolean;
  error: string;
}

const EMPTY_PAGINATION: ReportPagination = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

const emptyCollection = <T>(): ReportCollectionState<T> => ({
  items: [],
  pagination: { ...EMPTY_PAGINATION },
  loading: false,
  error: '',
});

export const formatReportDateForTimezone = (
  value: string,
  timezone: string,
  locale = 'ar-EG',
): string => new Intl.DateTimeFormat(locale, {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date(value));

export const formatReportTimestampForTimezone = (
  value: string,
  timezone: string,
  locale = 'ar-EG',
): string => new Intl.DateTimeFormat(locale, {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, WorkspaceSelectorComponent],
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);
  private workspaceId = '';
  private appliedFilters: ReportFilters | null = null;
  private filterRevision = 0;
  private attendanceRequestId = 0;
  private workspaceRequestId = 0;
  private workspaceSubscription: Subscription | null = null;
  private readonly financeRequestIds = {
    payments: 0,
    invoices: 0,
    allocations: 0,
  };

  readonly activeTab = signal<'attendance' | 'finance'>('attendance');
  readonly workspaceLoading = signal(true);
  readonly workspaceError = signal('');
  readonly workspaceAvailability = signal<WorkspaceAvailability | null>(null);
  readonly attendanceLoading = signal(false);
  readonly attendanceError = signal('');
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly attendance = signal<AttendanceReport | null>(null);
  readonly finance = signal<FinanceReport | null>(null);
  readonly payments = signal(emptyCollection<FinanceReport['payments']['items'][number]>());
  readonly invoices = signal(emptyCollection<FinanceReport['invoices']['items'][number]>());
  readonly allocations = signal(emptyCollection<FinanceReport['allocations']['items'][number]>());

  readonly filters = new FormGroup({
    from: new FormControl(this.toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1))),
    to: new FormControl(this.toDateInput(new Date())),
    studentId: new FormControl(''),
    groupId: new FormControl(''),
  });

  constructor() {
    this.appliedFilters = this.readFormFilters();
    this.loadWorkspace();
  }

  retryWorkspace(): void {
    this.loadWorkspace(true);
  }

  private loadWorkspace(refresh = false): void {
    const requestId = ++this.workspaceRequestId;
    this.workspaceSubscription?.unsubscribe();
    this.workspaceId = '';
    this.workspaceAvailability.set(null);
    this.workspaceLoading.set(true);
    this.workspaceError.set('');
    this.error.set('');
    this.invalidateRequests();
    this.clearReportData();

    const availability$ =
      this.workspaceService.watchWorkspaceAvailability?.(refresh) ??
      this.workspaceService.getWorkspaceAvailability(refresh);
    this.workspaceSubscription = availability$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (availability) => {
          if (requestId !== this.workspaceRequestId) return;
          this.workspaceAvailability.set(availability);
          this.workspaceLoading.set(false);
          const nextWorkspaceId = availability.kind === 'active' ? availability.workspace._id : '';
          if (nextWorkspaceId !== this.workspaceId) {
            this.workspaceId = nextWorkspaceId;
            this.invalidateRequests();
            this.clearReportData();
          }
          if (availability.kind !== 'active') return;

          this.appliedFilters = this.readFormFilters();
          this.load();
        },
        error: () => {
          if (requestId !== this.workspaceRequestId) return;
          this.workspaceLoading.set(false);
          this.workspaceAvailability.set(null);
          this.workspaceError.set('تعذر تحميل مساحة العمل.');
          this.clearReportData();
        },
      });
  }

  setTab(tab: 'attendance' | 'finance'): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    if (tab === 'attendance' && !this.attendance()) this.load();
    if (tab === 'finance' && !this.finance()) this.load();
  }

  load(): void {
    if (!this.workspaceId || !this.appliedFilters) return;
    if (!this.appliedFilters.timezone) {
      const message = 'تعذر تحديد المنطقة الزمنية لهذا الجهاز.';
      if (this.activeTab() === 'attendance') {
        this.attendanceLoading.set(false);
        this.attendanceError.set(message);
      } else {
        this.payments.update((state) => ({ ...state, loading: false, error: message }));
        this.invoices.update((state) => ({ ...state, loading: false, error: message }));
        this.allocations.update((state) => ({ ...state, loading: false, error: message }));
      }
      return;
    }
    if (this.activeTab() === 'attendance') {
      this.loadAttendancePage(1);
    } else {
      this.loadFinancePage(1);
    }
  }

  applyFilters(): void {
    this.error.set('');
    this.appliedFilters = this.readFormFilters();
    this.invalidateRequests();
    this.clearReportData();
    this.load();
  }

  changeAttendancePage(page: number): void {
    const pagination = this.attendance()?.pagination;
    if (!pagination || this.attendanceLoading() || page < 1 || page > pagination.totalPages || page === pagination.page) {
      return;
    }
    this.loadAttendancePage(page);
  }

  retryAttendancePage(): void {
    this.loadAttendancePage(this.attendance()?.pagination.page ?? 1);
  }

  changeFinancePage(collection: 'payments' | 'invoices' | 'allocations', page: number): void {
    const state = this.financeCollectionState(collection);
    if (state.loading || page < 1 || page > state.pagination.totalPages || page === state.pagination.page) {
      return;
    }
    this.loadFinanceCollectionPage(collection, page);
  }

  retryFinanceCollection(collection: 'payments' | 'invoices' | 'allocations'): void {
    this.loadFinanceCollectionPage(collection, this.financeCollectionState(collection).pagination.page);
  }

  pageCount(pagination: ReportPagination): number {
    return Math.max(pagination.totalPages, 1);
  }

  suspendedWorkspaces(): Workspace[] {
    const availability = this.workspaceAvailability();
    return availability?.kind === 'suspended' ? availability.workspaces : [];
  }

  private loadAttendancePage(page: number): void {
    if (!this.workspaceId || !this.appliedFilters) return;
    if (!this.appliedFilters.timezone) {
      this.attendanceLoading.set(false);
      this.attendanceError.set('تعذر تحديد المنطقة الزمنية لهذا الجهاز.');
      return;
    }
    const workspaceId = this.workspaceId;
    const revision = this.filterRevision;
    const requestId = ++this.attendanceRequestId;
    this.attendanceLoading.set(true);
    this.attendanceError.set('');
    if (page !== 1 || this.attendance()) {
      this.attendance.update((report) =>
        report
          ? {
              ...report,
              items: [],
              pagination: { ...report.pagination, page },
            }
          : null,
      );
    }

    this.reportService
      .getAttendance(workspaceId, {
        ...this.appliedFilters,
        page,
        pageSize: EMPTY_PAGINATION.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (requestId !== this.attendanceRequestId || revision !== this.filterRevision || workspaceId !== this.workspaceId) return;
          this.attendance.set(report);
          this.attendanceLoading.set(false);
        },
        error: () => {
          if (requestId !== this.attendanceRequestId || revision !== this.filterRevision || workspaceId !== this.workspaceId) return;
          this.attendanceLoading.set(false);
          this.attendanceError.set('تعذر تحميل صفحة تقرير الحضور.');
        },
      });
  }

  private loadFinancePage(page: number): void {
    if (!this.workspaceId || !this.appliedFilters) return;
    this.setFinanceCollectionsLoading(true);
    const requestIds = {
      payments: ++this.financeRequestIds.payments,
      invoices: ++this.financeRequestIds.invoices,
      allocations: ++this.financeRequestIds.allocations,
    };
    const workspaceId = this.workspaceId;
    const revision = this.filterRevision;

    this.reportService
      .getFinance(workspaceId, {
        from: this.appliedFilters.from,
        to: this.appliedFilters.to,
        studentId: this.appliedFilters.studentId,
        timezone: this.appliedFilters.timezone,
        page,
        pageSize: EMPTY_PAGINATION.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (revision !== this.filterRevision || workspaceId !== this.workspaceId) return;
          this.finance.set(report);
          if (requestIds.payments === this.financeRequestIds.payments) {
            this.payments.set(this.toCollectionState(report.payments));
          }
          if (requestIds.invoices === this.financeRequestIds.invoices) {
            this.invoices.set(this.toCollectionState(report.invoices));
          }
          if (requestIds.allocations === this.financeRequestIds.allocations) {
            this.allocations.set(this.toCollectionState(report.allocations));
          }
        },
        error: () => {
          if (revision !== this.filterRevision || workspaceId !== this.workspaceId) return;
          if (requestIds.payments === this.financeRequestIds.payments) {
            this.payments.update((state) => ({
              ...state,
              loading: false,
              error: 'تعذر تحميل المدفوعات.',
            }));
          }
          if (requestIds.invoices === this.financeRequestIds.invoices) {
            this.invoices.update((state) => ({
              ...state,
              loading: false,
              error: 'تعذر تحميل الفواتير.',
            }));
          }
          if (requestIds.allocations === this.financeRequestIds.allocations) {
            this.allocations.update((state) => ({
              ...state,
              loading: false,
              error: 'تعذر تحميل التخصيصات.',
            }));
          }
        },
      });
  }

  private loadFinanceCollectionPage(collection: 'payments' | 'invoices' | 'allocations', page: number): void {
    if (!this.workspaceId || !this.appliedFilters) return;
    if (!this.appliedFilters.timezone) {
      this.setFinanceCollectionError(collection);
      return;
    }
    const workspaceId = this.workspaceId;
    const revision = this.filterRevision;
    const requestId = ++this.financeRequestIds[collection];
    this.setFinanceCollectionPageLoading(collection, page);

    this.reportService
      .getFinance(workspaceId, {
        from: this.appliedFilters.from,
        to: this.appliedFilters.to,
        studentId: this.appliedFilters.studentId,
        timezone: this.appliedFilters.timezone,
        page,
        pageSize: EMPTY_PAGINATION.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          if (requestId !== this.financeRequestIds[collection] || revision !== this.filterRevision || workspaceId !== this.workspaceId) return;
          if (!this.finance()) this.finance.set(report);
          this.setFinanceCollectionResponse(collection, report);
        },
        error: () => {
          if (requestId !== this.financeRequestIds[collection] || revision !== this.filterRevision || workspaceId !== this.workspaceId) return;
          this.setFinanceCollectionError(collection);
        },
      });
  }

  private readFormFilters(): ReportFilters {
    const timezone = this.getTimezone();
    return {
      from: this.localDateToIso(this.filters.controls.from.value),
      to: this.localDateToIso(this.filters.controls.to.value, true),
      studentId: this.filters.controls.studentId.value?.trim() || undefined,
      groupId: this.filters.controls.groupId.value?.trim() || undefined,
      timezone: timezone ?? '',
    };
  }

  private setFinanceCollectionPageLoading(collection: 'payments' | 'invoices' | 'allocations', page: number): void {
    if (collection === 'payments') {
      this.payments.update((state) => ({
        ...state,
        items: [],
        pagination: { ...state.pagination, page },
        loading: true,
        error: '',
      }));
    } else if (collection === 'invoices') {
      this.invoices.update((state) => ({
        ...state,
        items: [],
        pagination: { ...state.pagination, page },
        loading: true,
        error: '',
      }));
    } else {
      this.allocations.update((state) => ({
        ...state,
        items: [],
        pagination: { ...state.pagination, page },
        loading: true,
        error: '',
      }));
    }
  }

  private financeCollectionState(collection: 'payments' | 'invoices' | 'allocations') {
    if (collection === 'payments') return this.payments();
    if (collection === 'invoices') return this.invoices();
    return this.allocations();
  }

  private setFinanceCollectionResponse(collection: 'payments' | 'invoices' | 'allocations', report: FinanceReport): void {
    if (collection === 'payments') this.payments.set(this.toCollectionState(report.payments));
    if (collection === 'invoices') this.invoices.set(this.toCollectionState(report.invoices));
    if (collection === 'allocations') {
      this.allocations.set(this.toCollectionState(report.allocations));
    }
  }

  private setFinanceCollectionError(collection: 'payments' | 'invoices' | 'allocations'): void {
    const error = this.financeCollectionError(collection);
    if (collection === 'payments') {
      this.payments.update((state) => ({ ...state, loading: false, error }));
    } else if (collection === 'invoices') {
      this.invoices.update((state) => ({ ...state, loading: false, error }));
    } else {
      this.allocations.update((state) => ({ ...state, loading: false, error }));
    }
  }

  private toCollectionState<T>(collection: ReportCollection<T>): ReportCollectionState<T> {
    return {
      items: collection.items,
      pagination: collection.pagination,
      loading: false,
      error: '',
    };
  }

  private setFinanceCollectionsLoading(loading: boolean): void {
    this.payments.update((state) => ({ ...state, loading, error: '' }));
    this.invoices.update((state) => ({ ...state, loading, error: '' }));
    this.allocations.update((state) => ({ ...state, loading, error: '' }));
  }

  private financeCollectionError(collection: 'payments' | 'invoices' | 'allocations'): string {
    return {
      payments: 'تعذر تحميل المدفوعات.',
      invoices: 'تعذر تحميل الفواتير.',
      allocations: 'تعذر تحميل التخصيصات.',
    }[collection];
  }

  private invalidateRequests(): void {
    this.filterRevision += 1;
    this.attendanceRequestId += 1;
    this.financeRequestIds.payments += 1;
    this.financeRequestIds.invoices += 1;
    this.financeRequestIds.allocations += 1;
  }

  private clearReportData(): void {
    this.attendance.set(null);
    this.attendanceLoading.set(false);
    this.attendanceError.set('');
    this.finance.set(null);
    this.payments.set(emptyCollection());
    this.invoices.set(emptyCollection());
    this.allocations.set(emptyCollection());
  }

  async exportExcel(): Promise<void> {
    if (this.exporting()) return;
    const context = this.captureExportContext('لا تتوفر مساحة عمل نشطة لتصدير التقرير.');
    if (!context) return;
    this.exporting.set(true);
    this.error.set('');
    try {
      const result = await this.requestExport(context);
      if (!this.isCurrentExport(context)) return;
      const attendance = result.type === 'attendance' ? result.report : null;
      const finance = result.type === 'finance' ? result.report : null;
      const html = this.buildExportHtml(attendance, finance);
      const title = result.type === 'attendance'
        ? 'تقرير الحضور'
        : 'التقرير المالي';
      this.downloadBlob(
        new Blob(['\ufeff', html], { type: 'text/html;charset=utf-8' }),
        `${title}.html`,
      );
    } catch (error) {
      this.error.set(this.exportFailureMessage(error, false));
    } finally {
      this.exporting.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    if (this.exporting()) return;
    const context = this.captureExportContext('لا تتوفر مساحة عمل نشطة لإعداد التقرير.');
    if (!context) return;
    const popup = window.open('', '_blank');
    if (!popup) {
      this.error.set('اسمح بفتح النافذة لإعداد نسخة الطباعة.');
      return;
    }
    this.exporting.set(true);
    this.error.set('');
    try {
      const result = await this.requestExport(context);
      if (!this.isCurrentExport(context)) {
        popup.close();
        return;
      }
      const report = result.report;
      const title = result.type === 'attendance' ? 'تقرير الحضور' : 'التقرير المالي';
      const period = `${this.formatReportDate(report.period.from)} — ${this.formatReportDate(report.period.to)}`;
      const body = result.type === 'attendance'
        ? this.attendancePrintRows(result.report)
        : this.financePrintRows(result.report);
      popup.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title><style>
        body{font-family:Cairo,Arial,sans-serif;padding:24px;color:#173b32}
        table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #bfcac3;padding:8px;text-align:right;font-size:12px}
        h1{font-size:20px}p{font-size:12px}
      </style></head><body><h1>${title}</h1><p>الفترة: ${period}</p>${body}</body></html>`);
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (error) {
      popup.close();
      this.error.set(this.exportFailureMessage(error, true));
    } finally {
      this.exporting.set(false);
    }
  }

  private buildExportHtml(
    attendance: AttendanceReport | null,
    finance: FinanceReport | null,
  ): string {
    const title = attendance
      ? 'تقرير الحضور'
      : 'التقرير المالي';
    const report = attendance ?? finance;
    if (!report) throw new Error('No report data available for export');
    const period = `${this.formatReportDate(report.period.from)} — ${this.formatReportDate(report.period.to)}`;

    let table: string;
    if (attendance) {
      table = `<tr><th>الطالب</th><th>المجموعة</th><th>الحصة</th><th>الحالة</th><th>دقائق التأخير</th><th>التوقيت</th></tr>` +
        attendance.items.map((row) => {
          return `<tr><td>${this.escape(row.studentName)}</td><td>${this.escape(row.groupName)}</td><td>${this.escape(row.sessionTitle)}</td><td>${this.escape(row.status)}</td><td>${row.lateMinutes}</td><td>${this.escape(this.formatReportTimestamp(row.sessionStartsAt))}</td></tr>`;
        }).join('');
    } else {
      table = `<tr><th>نوع السجل</th><th>المعرف</th><th>المبلغ</th><th>التفاصيل</th><th>التوقيت</th></tr>` +
        (finance?.invoices.items ?? []).map((invoice) =>
          `<tr><td>فاتورة</td><td>${this.escape(invoice.invoiceNumber)}</td><td>${this.escape(invoice.totalAmount)}</td><td>${this.escape(invoice.status)}</td><td>${this.escape(invoice.issuedAt ? this.formatReportTimestamp(invoice.issuedAt) : '')}</td></tr>`
        ).join('') +
        (finance?.payments.items ?? []).map((payment) =>
          `<tr><td>دفعة</td><td>${this.escape(payment.id)}</td><td>${this.escape(payment.amount)}</td><td>${this.escape(payment.method)}</td><td>${this.escape(this.formatReportTimestamp(payment.receivedAt))}</td></tr>`
        ).join('') +
        (finance?.allocations.items ?? []).map((allocation) =>
          `<tr><td>تخصيص</td><td>${this.escape(allocation.id)}</td><td>${this.escape(allocation.amount)}</td><td>${this.escape(allocation.invoiceId)}</td><td>${this.escape(this.formatReportTimestamp(allocation.createdAt))}</td></tr>`
        ).join('');
    }

    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title></head><body><h2>${title}</h2><p>الفترة: ${period}</p><table border="1">${table}</table></body></html>`;
  }

  private attendancePrintRows(report: AttendanceReport): string {
    const summary = `<p>الحاضرون: ${report.summary.present} | الغائبون: ${report.summary.absent} | المتأخرون: ${report.summary.late} | المعذورون: ${report.summary.excused} | النسبة: ${this.formatRate(report.summary.attendanceRate)}</p>`;
    const rows = report.items.map((item) =>
      `<tr><td>${this.escape(item.studentName)}</td><td>${this.escape(item.groupName)}</td><td>${this.escape(item.status)}</td><td>${item.lateMinutes}</td></tr>`
    ).join('');
    return `${summary}<table><thead><tr><th>الطالب</th><th>المجموعة</th><th>الحالة</th><th>التأخير</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private financePrintRows(report: FinanceReport): string {
    const summary = `<p>إجمالي الفواتير: ${report.summary.issuedInvoiceTotal} ج.م | المحصّل: ${report.summary.collectedInPeriod} ج.م | المستحق الحالي: ${report.summary.currentOutstanding} ج.م | غير المخصّص: ${report.summary.unallocatedPayments} ج.م</p>`;
    const invoiceRows = report.invoices.items.map((invoice) =>
      `<tr><td>فاتورة</td><td>${this.escape(invoice.invoiceNumber)}</td><td>${this.escape(invoice.totalAmount)}</td><td>${this.escape(invoice.issuedAt ? this.formatReportTimestamp(invoice.issuedAt) : '')}</td></tr>`
    ).join('');
    const paymentRows = report.payments.items.map((payment) =>
      `<tr><td>دفعة</td><td>${this.escape(payment.amount)}</td><td>${this.escape(payment.method)}</td><td>${this.escape(this.formatReportTimestamp(payment.receivedAt))}</td></tr>`
    ).join('');
    const allocationRows = report.allocations.items.map((allocation) =>
      `<tr><td>تخصيص</td><td>${this.escape(allocation.amount)}</td><td>${this.escape(allocation.invoiceId)}</td><td>${this.escape(this.formatReportTimestamp(allocation.createdAt))}</td></tr>`
    ).join('');
    return `${summary}<table><thead><tr><th>النوع</th><th>المبلغ/الرقم</th><th>تفاصيل</th><th>التوقيت</th></tr></thead><tbody>${invoiceRows}${paymentRows}${allocationRows}</tbody></table>`;
  }

  formatMoney(value: string): string {
    return formatMoneyExact(value);
  }

  formatRate(value: number | null): string {
    return value === null
      ? 'غير متاح'
      : `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(value)}٪`;
  }

  formatReportDate(value: string): string {
    const timezone = this.getTimezone();
    if (!timezone) throw new Error('Unable to determine report timezone');
    return formatReportDateForTimezone(value, timezone);
  }

  private formatReportTimestamp(value: string): string {
    const timezone = this.getTimezone();
    if (!timezone) throw new Error('Unable to determine report timezone');
    return formatReportTimestampForTimezone(value, timezone);
  }

  private toDateInput(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  private localDateToIso(value: string | null, endOfDay = false): string | undefined {
    if (!value) return undefined;
    const time = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
    return new Date(`${value}${time}`).toISOString();
  }

  private getTimezone(): string | undefined {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  }

  private captureExportContext(message: string): ExportContext | null {
    if (!this.workspaceId || !this.appliedFilters) {
      this.error.set(message);
      return null;
    }
    if (!this.appliedFilters.timezone) {
      this.error.set('تعذر تحديد المنطقة الزمنية لهذا الجهاز.');
      return null;
    }
    return {
      workspaceId: this.workspaceId,
      revision: this.filterRevision,
      type: this.activeTab(),
      filters: { ...this.appliedFilters },
    };
  }

  private async requestExport(context: ExportContext): Promise<ExportResult> {
    const request: ReportExportRequest = context.type === 'attendance'
      ? { type: 'attendance', ...context.filters }
      : {
          type: 'finance',
          from: context.filters.from,
          to: context.filters.to,
          studentId: context.filters.studentId,
          timezone: context.filters.timezone,
        };
    const report = await firstValueFrom(
      this.reportService.exportReport(context.workspaceId, request),
    );
    if (context.type === 'attendance') {
      if (!('items' in report)) throw new Error('Unexpected report export response');
      return { type: 'attendance', report };
    }
    if ('items' in report) throw new Error('Unexpected report export response');
    return { type: 'finance', report };
  }

  private isCurrentExport(context: ExportContext): boolean {
    return context.workspaceId === this.workspaceId &&
      context.revision === this.filterRevision;
  }

  private exportFailureMessage(error: unknown, forPrint: boolean): string {
    if (error instanceof HttpErrorResponse && error.status === 503) {
      return 'تعذر إنشاء تصدير متسق حاليًا. حاول مرة أخرى لاحقًا.';
    }
    if (
      error instanceof HttpErrorResponse &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      error.error.message === 'Each exported report collection is limited to 10,000 records'
    ) {
      return 'التقرير يتجاوز حد التصدير الآمن (10,000 سجل لكل نوع). قلّص الفترة أو المرشحات.';
    }
    return forPrint
      ? 'تعذر إعداد نسخة الطباعة الكاملة. ضيّق الفترة أو المرشحات ثم حاول مجددًا.'
      : 'تعذر تصدير التقرير بالكامل. ضيّق الفترة أو المرشحات ثم حاول مجددًا.';
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
