import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  AttendanceReport,
  FinanceReport,
  ReportService,
} from '../../core/services/report.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { formatMoneyExact } from '../../core/utils/finance';

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
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reports.component.html',
})
export class ReportsComponent {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly reportService = inject(ReportService);
  private workspaceId = '';

  readonly activeTab = signal<'attendance' | 'finance'>('attendance');
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly attendance = signal<AttendanceReport | null>(null);
  readonly finance = signal<FinanceReport | null>(null);

  readonly filters = new FormGroup({
    from: new FormControl(this.toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1))),
    to: new FormControl(this.toDateInput(new Date())),
    studentId: new FormControl(''),
    groupId: new FormControl(''),
  });

  constructor() {
    this.workspaceService.getActiveWorkspace().subscribe({
      next: (workspace) => {
        if (workspace?._id) {
          this.workspaceId = workspace._id;
          this.load();
        } else {
          this.error.set('لا توجد مساحة عمل متاحة.');
        }
      },
      error: () => this.error.set('تعذر تحميل مساحة العمل.'),
    });
  }

  setTab(tab: 'attendance' | 'finance'): void {
    this.activeTab.set(tab);
    this.load();
  }

  load(): void {
    if (!this.workspaceId) return;
    this.loading.set(true);
    this.error.set('');
    const from = this.localDateToIso(this.filters.controls.from.value);
    const to = this.localDateToIso(this.filters.controls.to.value, true);
    const studentId = this.filters.controls.studentId.value?.trim() || undefined;
    const groupId = this.filters.controls.groupId.value?.trim() || undefined;
    const timezone = this.getTimezone();
    if (!timezone) {
      this.error.set('تعذر تحديد المنطقة الزمنية لهذا الجهاز.');
      this.loading.set(false);
      return;
    }

    if (this.activeTab() === 'attendance') {
      this.reportService.getAttendance(this.workspaceId, {
        from,
        to,
        studentId,
        groupId,
        timezone,
        page: 1,
        pageSize: 100,
      }).subscribe({
        next: (report) => {
          this.attendance.set(report);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('تعذر تحميل تقرير الحضور.');
          this.loading.set(false);
        },
      });
    } else {
      this.reportService.getFinance(this.workspaceId, {
        from,
        to,
        studentId,
        timezone,
        page: 1,
        pageSize: 100,
      }).subscribe({
        next: (report) => {
          this.finance.set(report);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('تعذر تحميل التقرير المالي.');
          this.loading.set(false);
        },
      });
    }
  }

  async exportExcel(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.error.set('');
    try {
      const attendance = this.activeTab() === 'attendance'
        ? await this.fetchAllAttendance()
        : null;
      const finance = this.activeTab() === 'finance'
        ? await this.fetchAllFinance()
        : null;
      const html = this.buildExportHtml(attendance, finance);
      const title = this.activeTab() === 'attendance'
        ? 'تقرير الحضور'
        : 'التقرير المالي';
      this.downloadBlob(
        new Blob(['\ufeff', html], { type: 'text/html;charset=utf-8' }),
        `${title}.html`,
      );
    } catch (error) {
      this.error.set(error instanceof Error && error.message === 'export-limit'
        ? 'التقرير يتجاوز حد التصدير الآمن (10,000 سجل لكل نوع). قلّص الفترة أو المرشحات.'
        : 'تعذر تصدير التقرير بالكامل. ضيّق الفترة أو المرشحات ثم حاول مجددًا.');
    } finally {
      this.exporting.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    if (this.exporting()) return;
    const popup = window.open('', '_blank');
    if (!popup) {
      this.error.set('اسمح بفتح النافذة لإعداد نسخة الطباعة.');
      return;
    }
    this.exporting.set(true);
    this.error.set('');
    try {
      const attendance = this.activeTab() === 'attendance'
        ? await this.fetchAllAttendance()
        : null;
      const finance = this.activeTab() === 'finance'
        ? await this.fetchAllFinance()
        : null;
      const report = attendance ?? finance;
      if (!report) {
        popup.close();
        return;
      }
      const title = attendance ? 'تقرير الحضور' : 'التقرير المالي';
      const period = `${this.formatReportDate(report.period.from)} — ${this.formatReportDate(report.period.to)}`;
      const body = attendance
        ? this.attendancePrintRows(attendance)
        : this.financePrintRows(finance!);
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
      this.error.set(error instanceof Error && error.message === 'export-limit'
        ? 'التقرير يتجاوز حد التصدير الآمن (10,000 سجل لكل نوع). قلّص الفترة أو المرشحات.'
        : 'تعذر إعداد نسخة الطباعة الكاملة. ضيّق الفترة أو المرشحات ثم حاول مجددًا.');
    } finally {
      this.exporting.set(false);
    }
  }

  private buildExportHtml(
    attendance: AttendanceReport | null,
    finance: FinanceReport | null,
  ): string {
    const title = this.activeTab() === 'attendance'
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

  private getReportFilters() {
    const timezone = this.getTimezone();
    if (!timezone) throw new Error('timezone-unavailable');
    return {
      from: this.localDateToIso(this.filters.controls.from.value),
      to: this.localDateToIso(this.filters.controls.to.value, true),
      studentId: this.filters.controls.studentId.value?.trim() || undefined,
      groupId: this.filters.controls.groupId.value?.trim() || undefined,
      timezone,
    };
  }

  private async fetchAllAttendance(): Promise<AttendanceReport> {
    const filters = this.getReportFilters();
    const pageSize = 100;
    const first = await firstValueFrom(this.reportService.getAttendance(
      this.workspaceId,
      { ...filters, page: 1, pageSize },
    ));
    const totalItems = first.pagination.totalItems;
    if (totalItems > 10_000) throw new Error('export-limit');
    const items = [...first.items];
    const seenIds = new Set(items.map((item) => item.id));
    if (seenIds.size !== items.length) throw new Error('report-changed');

    for (let page = 2; page <= first.pagination.totalPages; page += 1) {
      const response = await firstValueFrom(this.reportService.getAttendance(
        this.workspaceId,
        { ...filters, page, pageSize },
      ));
      if (response.pagination.totalItems !== totalItems) {
        throw new Error('report-changed');
      }
      if (response.items.some((item) => seenIds.has(item.id))) {
        throw new Error('report-changed');
      }
      response.items.forEach((item) => seenIds.add(item.id));
      items.push(...response.items);
    }
    if (items.length !== totalItems) throw new Error('report-changed');
    return { ...first, items };
  }

  private async fetchAllFinance(): Promise<FinanceReport> {
    const filters = this.getReportFilters();
    const pageSize = 100;
    const first = await firstValueFrom(this.reportService.getFinance(
      this.workspaceId,
      { from: filters.from, to: filters.to, studentId: filters.studentId, timezone: filters.timezone, page: 1, pageSize },
    ));
    const collections = {
      invoices: [...first.invoices.items],
      payments: [...first.payments.items],
      allocations: [...first.allocations.items],
    };
    const seenIds = {
      invoices: new Set(collections.invoices.map((item) => item.id)),
      payments: new Set(collections.payments.map((item) => item.id)),
      allocations: new Set(collections.allocations.map((item) => item.id)),
    };
    const totals = {
      invoices: first.invoices.pagination.totalItems,
      payments: first.payments.pagination.totalItems,
      allocations: first.allocations.pagination.totalItems,
    };
    if (Object.values(totals).some((total) => total > 10_000)) {
      throw new Error('export-limit');
    }
    const totalPages = Math.max(
      first.invoices.pagination.totalPages,
      first.payments.pagination.totalPages,
      first.allocations.pagination.totalPages,
    );

    for (let page = 2; page <= totalPages; page += 1) {
      const response = await firstValueFrom(this.reportService.getFinance(
        this.workspaceId,
        { from: filters.from, to: filters.to, studentId: filters.studentId, timezone: filters.timezone, page, pageSize },
      ));
      if (
        response.invoices.pagination.totalItems !== totals.invoices ||
        response.payments.pagination.totalItems !== totals.payments ||
        response.allocations.pagination.totalItems !== totals.allocations
      ) {
        throw new Error('report-changed');
      }
      if (
        response.invoices.items.some((item) => seenIds.invoices.has(item.id)) ||
        response.payments.items.some((item) => seenIds.payments.has(item.id)) ||
        response.allocations.items.some((item) => seenIds.allocations.has(item.id))
      ) {
        throw new Error('report-changed');
      }
      response.invoices.items.forEach((item) => seenIds.invoices.add(item.id));
      response.payments.items.forEach((item) => seenIds.payments.add(item.id));
      response.allocations.items.forEach((item) => seenIds.allocations.add(item.id));
      collections.invoices.push(...response.invoices.items);
      collections.payments.push(...response.payments.items);
      collections.allocations.push(...response.allocations.items);
    }
    if (
      collections.invoices.length !== totals.invoices ||
      collections.payments.length !== totals.payments ||
      collections.allocations.length !== totals.allocations
    ) {
      throw new Error('report-changed');
    }
    return {
      ...first,
      invoices: { ...first.invoices, items: collections.invoices },
      payments: { ...first.payments, items: collections.payments },
      allocations: { ...first.allocations, items: collections.allocations },
    };
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
