import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FinanceService } from '../../core/services/finance.service';
import { DashboardSummary, ReportService } from '../../core/services/report.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { formatFinanceTimestamp, formatMoneyExact } from '../../core/utils/finance';
import { Payment, PaymentMethod } from '../../core/models/finance.models';
import { WorkspaceSelectorComponent } from '../workspace/workspace-selector.component';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدًا',
  bank_transfer: 'تحويل بنكي',
  card: 'بطاقة',
  wallet: 'محفظة إلكترونية',
  other: 'أخرى',
};

@Component({
  selector: 'app-finance-overview',
  standalone: true,
  imports: [RouterLink, WorkspaceSelectorComponent],
  templateUrl: './finance-overview.component.html',
})
export class FinanceOverviewComponent {
  private readonly workspaceService = inject(WorkspaceService);
  private readonly reportService = inject(ReportService);
  private readonly financeService = inject(FinanceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly draftInvoiceCount = signal(0);
  readonly recentPayments = signal<Payment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  private workspaceId = '';
  private workspaceRequestId = 0;

  constructor() {
    const activeWorkspace$ =
      this.workspaceService.watchActiveWorkspace?.() ??
      this.workspaceService.getActiveWorkspace();
    activeWorkspace$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (workspace) => {
          if (!workspace?._id) {
            this.resetWorkspaceData();
            this.workspaceId = '';
            this.error.set('اختر مساحة عمل نشطة من القائمة أعلاه.');
            this.loading.set(false);
            return;
          }
          if (this.workspaceId !== workspace._id) {
            this.resetWorkspaceData();
          }
          this.workspaceId = workspace._id;
          this.error.set('');
          this.loading.set(true);
          const requestId = ++this.workspaceRequestId;
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (!timezone) {
            this.error.set('تعذر تحديد المنطقة الزمنية لهذا الجهاز.');
            this.loading.set(false);
            return;
          }

          forkJoin({
            summary: this.reportService.getDashboard(workspace._id, timezone),
            drafts: this.financeService.listInvoices(workspace._id, {
              page: 1,
              pageSize: 1,
              status: 'draft',
            }),
            payments: this.financeService.listPayments(workspace._id, {
              page: 1,
              pageSize: 5,
              status: 'completed',
            }),
          })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: ({ summary, drafts, payments }) => {
                if (requestId !== this.workspaceRequestId || this.workspaceId !== workspace._id) {
                  return;
                }
                this.summary.set(summary);
                this.draftInvoiceCount.set(drafts.pagination.totalItems);
                this.recentPayments.set(payments.items);
                this.loading.set(false);
              },
              error: (requestError: unknown) => {
                if (requestId !== this.workspaceRequestId || this.workspaceId !== workspace._id) {
                  return;
                }
                this.error.set(getApiErrorMessage(requestError, 'تعذر تحميل بيانات المالية.'));
                this.loading.set(false);
              },
            });
        },
        error: (requestError: unknown) => {
          this.error.set(getApiErrorMessage(requestError, 'تعذر تحميل مساحة العمل.'));
          this.loading.set(false);
        },
      });
  }

  readonly money = formatMoneyExact;
  readonly timestamp = formatFinanceTimestamp;

  private resetWorkspaceData(): void {
    this.workspaceRequestId += 1;
    this.summary.set(null);
    this.draftInvoiceCount.set(0);
    this.recentPayments.set([]);
    this.loading.set(true);
    this.error.set('');
  }

  paymentMethodLabel(method: PaymentMethod): string {
    return PAYMENT_METHOD_LABELS[method];
  }
}
