import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AttendanceReport,
  FinanceReport,
  ReportService,
} from '../../core/services/report.service';
import { WorkspaceService } from '../../core/services/workspace.service';

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
    this.workspaceService.getMyWorkspaces().subscribe({
      next: (workspaces) => {
        const workspace = workspaces.find((item) => item.status === 'active') ?? workspaces[0];
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

    if (this.activeTab() === 'attendance') {
      this.reportService.getAttendance(this.workspaceId, {
        from,
        to,
        studentId,
        groupId,
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

  exportExcel(): void {
    const title = this.activeTab() === 'attendance'
      ? 'تقرير الحضور'
      : 'التقرير المالي';
    const rows = this.activeTab() === 'attendance'
      ? this.attendance()?.items ?? []
      : this.finance()?.payments.items ?? [];

    let table: string;
    if (this.activeTab() === 'attendance') {
      table = `<tr><th>الطالب</th><th>المجموعة</th><th>الحصة</th><th>الحالة</th><th>دقائق التأخير</th><th>التوقيت</th></tr>` +
        rows.map((item) => {
          const row = item as AttendanceReport['items'][number];
          return `<tr><td>${this.escape(row.studentName)}</td><td>${this.escape(row.groupName)}</td><td>${this.escape(row.sessionTitle)}</td><td>${this.escape(row.status)}</td><td>${row.lateMinutes}</td><td>${this.escape(row.sessionStartsAt)}</td></tr>`;
        }).join('');
    } else {
      const finance = this.finance();
      table = `<tr><th>نوع السجل</th><th>المعرف</th><th>المبلغ</th><th>التفاصيل</th><th>التوقيت</th></tr>` +
        (finance?.invoices.items ?? []).map((invoice) =>
          `<tr><td>فاتورة</td><td>${this.escape(invoice.invoiceNumber)}</td><td>${this.escape(invoice.totalAmount)}</td><td>${this.escape(invoice.status)}</td><td>${this.escape(invoice.issuedAt ?? '')}</td></tr>`
        ).join('') +
        (finance?.payments.items ?? []).map((payment) =>
          `<tr><td>دفعة</td><td>${this.escape(payment.id)}</td><td>${this.escape(payment.amount)}</td><td>${this.escape(payment.method)}</td><td>${this.escape(payment.receivedAt)}</td></tr>`
        ).join('') +
        (finance?.allocations.items ?? []).map((allocation) =>
          `<tr><td>تخصيص</td><td>${this.escape(allocation.id)}</td><td>${this.escape(allocation.amount)}</td><td>${this.escape(allocation.invoiceId)}</td><td>${this.escape(allocation.createdAt)}</td></tr>`
        ).join('');
    }

    const html = `<html><head><meta charset="UTF-8"></head><body><h2>${title}</h2><table border="1">${table}</table></body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    this.downloadBlob(blob, `${title}.xls`);
  }

  exportPdf(): void {
    const report = this.activeTab() === 'attendance'
      ? this.attendance()
      : this.finance();
    if (!report) return;
    const title = this.activeTab() === 'attendance' ? 'تقرير الحضور' : 'التقرير المالي';
    const period = `${report.period.from.slice(0, 10)} — ${report.period.to.slice(0, 10)}`;
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) return;
    const body = this.activeTab() === 'attendance'
      ? this.attendancePrintRows()
      : this.financePrintRows();
    popup.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:Cairo,Arial,sans-serif;padding:24px;color:#173b32}
      table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #bfcac3;padding:8px;text-align:right;font-size:12px}
      h1{font-size:20px}p{font-size:12px}
    </style></head><body><h1>${title}</h1><p>الفترة: ${period}</p>${body}</body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  private attendancePrintRows(): string {
    const report = this.attendance();
    if (!report) return '';
    const summary = `<p>الحاضرون: ${report.summary.present} | الغائبون: ${report.summary.absent} | المتأخرون: ${report.summary.late} | المعذورون: ${report.summary.excused} | النسبة: ${this.formatRate(report.summary.attendanceRate)}</p>`;
    const rows = report.items.map((item) =>
      `<tr><td>${this.escape(item.studentName)}</td><td>${this.escape(item.groupName)}</td><td>${this.escape(item.status)}</td><td>${item.lateMinutes}</td></tr>`
    ).join('');
    return `${summary}<table><thead><tr><th>الطالب</th><th>المجموعة</th><th>الحالة</th><th>التأخير</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  private financePrintRows(): string {
    const report = this.finance();
    if (!report) return '';
    const summary = `<p>إجمالي الفواتير: ${report.summary.issuedInvoiceTotal} ج.م | المحصّل: ${report.summary.collectedInPeriod} ج.م | المستحق الحالي: ${report.summary.currentOutstanding} ج.م | غير المخصّص: ${report.summary.unallocatedPayments} ج.م</p>`;
    const invoiceRows = report.invoices.items.map((invoice) =>
      `<tr><td>فاتورة</td><td>${this.escape(invoice.invoiceNumber)}</td><td>${this.escape(invoice.totalAmount)}</td><td>${this.escape(invoice.issuedAt ?? '')}</td></tr>`
    ).join('');
    const paymentRows = report.payments.items.map((payment) =>
      `<tr><td>دفعة</td><td>${this.escape(payment.amount)}</td><td>${this.escape(payment.method)}</td><td>${this.escape(payment.receivedAt)}</td></tr>`
    ).join('');
    const allocationRows = report.allocations.items.map((allocation) =>
      `<tr><td>تخصيص</td><td>${this.escape(allocation.amount)}</td><td>${this.escape(allocation.invoiceId)}</td><td>${this.escape(allocation.createdAt)}</td></tr>`
    ).join('');
    return `${summary}<table><thead><tr><th>النوع</th><th>المبلغ/الرقم</th><th>تفاصيل</th><th>التوقيت</th></tr></thead><tbody>${invoiceRows}${paymentRows}${allocationRows}</tbody></table>`;
  }

  formatMoney(value: string): string {
    const number = Number(value);
    if (!Number.isFinite(number)) return value;
    return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(number);
  }

  formatRate(value: number | null): string {
    return value === null
      ? 'غير متاح'
      : `${new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(value)}٪`;
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
