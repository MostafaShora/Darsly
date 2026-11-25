import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import {
  Invoice,
  Payment,
  PaymentAllocation,
  PaymentMethod,
  PaymentQuery,
  PaymentStatus,
} from '../../core/models/finance.models';
import { Student } from '../../core/models/people.models';
import { FinanceService } from '../../core/services/finance.service';
import { PeopleService } from '../../core/services/people.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import {
  formatFinanceTimestamp,
  formatMoneyExact,
  isPositiveDecimalString,
  positiveDecimalValidator,
} from '../../core/utils/finance';
import { localDateBoundaryToIso, localDateTimeToIso } from '../../core/utils/local-date-time';

type PaymentView = 'list' | 'create' | 'detail';

interface PaymentRow {
  payment: Payment;
  student: Student;
}

const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'نقدًا' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'card', label: 'بطاقة' },
  { value: 'wallet', label: 'محفظة إلكترونية' },
  { value: 'other', label: 'أخرى' },
];

const PAYMENT_STATUSES: ReadonlyArray<{ value: PaymentStatus; label: string }> = [
  { value: 'pending', label: 'قيد الانتظار' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'failed', label: 'فاشلة' },
  { value: 'refunded', label: 'مستردة' },
];

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './payments.component.html',
})
export class PaymentsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly peopleService = inject(PeopleService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly methods = PAYMENT_METHODS;
  readonly statuses = PAYMENT_STATUSES;
  readonly view = signal<PaymentView>('list');
  readonly paymentId = signal<string | null>(null);
  readonly payment = signal<Payment | null>(null);
  readonly paymentRows = signal<PaymentRow[]>([]);
  readonly student = signal<Student | null>(null);
  readonly allocations = signal<PaymentAllocation[]>([]);
  readonly studentOptions = signal<Student[]>([]);
  readonly studentSearch = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<PaymentStatus | ''>('', { nonNullable: true });
  readonly fromFilter = new FormControl('', { nonNullable: true });
  readonly toFilter = new FormControl('', { nonNullable: true });
  readonly pagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly studentPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly invoiceOptions = signal<Invoice[]>([]);
  readonly invoicePagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly selectedInvoice = signal<Invoice | null>(null);
  readonly latestAllocatedInvoice = signal<Invoice | null>(null);
  readonly filteredStudentId = signal('');
  readonly loading = signal(false);
  readonly detailsLoading = signal(false);
  readonly studentsLoading = signal(false);
  readonly allocationsLoading = signal(false);
  readonly invoiceOptionsLoading = signal(false);
  readonly submitting = signal(false);
  readonly allocationOpen = signal(false);
  readonly allocationSubmitting = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly allocationsError = signal('');
  readonly studentOptionsError = signal('');
  readonly invoiceOptionsError = signal('');
  readonly success = signal('');

  readonly paymentForm = this.formBuilder.nonNullable.group({
    studentId: ['', Validators.required],
    amount: [
      '',
      [
        Validators.required,
        Validators.maxLength(128),
        Validators.pattern(/^\d+(?:\.\d{1,2})?$/),
        positiveDecimalValidator,
      ],
    ],
    method: ['cash' as PaymentMethod, Validators.required],
    receivedAt: [''],
    reference: ['', Validators.maxLength(150)],
    notes: ['', Validators.maxLength(2000)],
  });

  readonly allocationForm = this.formBuilder.nonNullable.group({
    invoiceId: ['', Validators.required],
    amount: [
      '',
      [
        Validators.required,
        Validators.maxLength(128),
        Validators.pattern(/^\d+(?:\.\d{1,2})?$/),
        positiveDecimalValidator,
      ],
    ],
  });

  private workspaceId = '';
  private listRequest = 0;
  private detailRequest = 0;
  private studentSearchRequest = 0;
  private invoiceOptionsRequest = 0;
  private readonly studentCache = new Map<string, Student>();

  constructor() {
    const routePath = this.route.snapshot.routeConfig?.path ?? '';
    const id = this.route.snapshot.paramMap.get('paymentId');
    this.view.set(routePath === 'payments/new' ? 'create' : id ? 'detail' : 'list');
    this.paymentId.set(id);
    this.filteredStudentId.set(this.route.snapshot.queryParamMap.get('studentId') ?? '');
    const requestedStatus = this.route.snapshot.queryParamMap.get('status');
    if (PAYMENT_STATUSES.some((status) => status.value === requestedStatus)) {
      this.statusFilter.setValue(requestedStatus as PaymentStatus);
    }

    this.route.paramMap
      .pipe(
        map((params) => params.get('paymentId')),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((routeId) => {
        if (routeId === this.paymentId()) return;
        this.paymentId.set(routeId);
        if (this.view() !== 'detail') return;
        this.resetPaymentDetail();
        if (!routeId) {
          this.detailError.set('لم يتم تحديد معرف الدفعة.');
          return;
        }
        if (this.workspaceId) this.loadPayment(routeId);
      });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const studentId = params.get('studentId') ?? '';
      const statusValue = params.get('status') ?? '';
      const status = PAYMENT_STATUSES.some((item) => item.value === statusValue)
        ? (statusValue as PaymentStatus)
        : '';
      const studentChanged = studentId !== this.filteredStudentId();
      const statusChanged = status !== this.statusFilter.value;
      this.filteredStudentId.set(studentId);
      if (statusChanged) this.statusFilter.setValue(status);
      else if (studentChanged) this.reloadList();
    });

    this.workspaceService
      .getActiveWorkspace()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (workspace) => {
          if (!workspace?._id) {
            const message = 'لا توجد مساحة عمل نشطة لإدارة المدفوعات.';
            this.error.set(message);
            if (this.view() === 'detail') this.detailError.set(message);
            return;
          }
          this.workspaceId = workspace._id;
          this.loadCurrentView();
        },
        error: (requestError: unknown) => {
          const message = getApiErrorMessage(requestError, 'تعذر تحميل مساحة العمل.');
          this.error.set(message);
          if (this.view() === 'detail') this.detailError.set(message);
        },
      });

    this.statusFilter.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadList());
    this.fromFilter.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadList());
    this.toFilter.valueChanges
      .pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadList());
    this.studentSearch.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => {
        this.studentPagination.update((value) => ({ ...value, page: 1 }));
        this.loadStudentOptions(search);
      });
  }

  readonly money = formatMoneyExact;
  readonly timestamp = formatFinanceTimestamp;

  statusLabel(status: PaymentStatus): string {
    return PAYMENT_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  methodLabel(method: PaymentMethod): string {
    return PAYMENT_METHODS.find((item) => item.value === method)?.label ?? method;
  }

  canAllocate(): boolean {
    const current = this.payment();
    return (
      !!current &&
      current.status === 'completed' &&
      isPositiveDecimalString(current.unallocatedAmount)
    );
  }

  setPaymentPage(page: number): void {
    const current = this.pagination();
    if (page < 1 || page > current.totalPages || page === current.page) return;
    this.pagination.update((value) => ({ ...value, page }));
    this.loadPayments();
  }

  setStudentPage(page: number): void {
    const current = this.studentPagination();
    if (page < 1 || page > current.totalPages || page === current.page) return;
    this.studentPagination.update((value) => ({ ...value, page }));
    this.loadStudentOptions(this.studentSearch.value);
  }

  setInvoicePage(page: number): void {
    const current = this.invoicePagination();
    if (page < 1 || page > current.totalPages || page === current.page) return;
    this.invoicePagination.update((value) => ({ ...value, page }));
    const payment = this.payment();
    if (payment) this.loadInvoiceOptions(payment.studentId);
  }

  selectStudent(value: Student): void {
    this.student.set(value);
    this.studentCache.set(value.id, value);
    this.paymentForm.controls.studentId.setValue(value.id);
  }

  selectInvoice(value: Invoice): void {
    this.selectedInvoice.set(value);
    this.allocationForm.controls.invoiceId.setValue(value.id);
  }

  submitPayment(): void {
    if (this.submitting()) return;
    this.error.set('');
    this.success.set('');
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const value = this.paymentForm.getRawValue();
    const receivedAt = value.receivedAt ? localDateTimeToIso(value.receivedAt) : null;
    if (value.receivedAt && !receivedAt) {
      this.error.set('أدخل وقت استلام صحيحًا بالتوقيت المحلي.');
      return;
    }
    const input = {
      studentId: value.studentId,
      amount: value.amount.trim(),
      method: value.method,
      ...(receivedAt ? { receivedAt } : {}),
      ...(value.reference.trim() ? { reference: value.reference.trim() } : {}),
      ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
    };
    if (!isPositiveDecimalString(input.amount)) {
      this.paymentForm.controls.amount.setErrors({ positiveDecimal: true });
      return;
    }
    this.submitting.set(true);
    this.financeService.createPayment(this.workspaceId, input).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.success.set('تم تسجيل الدفعة وأكد الخادم حالتها.');
        void this.router.navigateByUrl(`/payments/${encodeURIComponent(created.id)}`);
      },
      error: (requestError: unknown) => {
        this.submitting.set(false);
        this.error.set(getApiErrorMessage(requestError, 'تعذر تسجيل الدفعة.'));
      },
    });
  }

  openAllocation(): void {
    const current = this.payment();
    if (
      !current ||
      current.status !== 'completed' ||
      !isPositiveDecimalString(current.unallocatedAmount)
    )
      return;
    this.allocationOpen.set(true);
    this.error.set('');
    this.latestAllocatedInvoice.set(null);
    this.allocationForm.reset({ invoiceId: '', amount: '' });
    this.selectedInvoice.set(null);
    this.invoicePagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.loadInvoiceOptions(current.studentId);
  }

  closeAllocation(): void {
    this.allocationOpen.set(false);
    this.invoiceOptionsError.set('');
    this.selectedInvoice.set(null);
  }

  submitAllocation(): void {
    const current = this.payment();
    if (!current || this.allocationSubmitting() || current.status !== 'completed') return;
    if (this.allocationForm.invalid) {
      this.allocationForm.markAllAsTouched();
      return;
    }
    const value = this.allocationForm.getRawValue();
    if (!isPositiveDecimalString(value.amount)) {
      this.allocationForm.controls.amount.setErrors({ positiveDecimal: true });
      return;
    }
    const requestId = this.detailRequest;
    this.allocationSubmitting.set(true);
    this.error.set('');
    this.financeService
      .createPaymentAllocation(this.workspaceId, current.id, {
        invoiceId: value.invoiceId,
        amount: value.amount.trim(),
      })
      .subscribe({
        next: () => {
          if (requestId !== this.detailRequest) return;
          this.allocationSubmitting.set(false);
          this.allocationOpen.set(false);
          this.success.set('تم تخصيص الدفعة وفق تحقق الخادم.');
          this.financeService.getInvoice(this.workspaceId, value.invoiceId).subscribe({
            next: (invoice) => {
              if (this.paymentId() === current.id) this.latestAllocatedInvoice.set(invoice);
            },
            error: (requestError: unknown) => {
              if (this.paymentId() === current.id) {
                this.detailError.set(
                  getApiErrorMessage(
                    requestError,
                    'تم التخصيص، لكن تعذر تحديث رصيد الفاتورة المعروضة.',
                  ),
                );
              }
            },
          });
          this.loadPayment(current.id);
        },
        error: (requestError: unknown) => {
          if (requestId !== this.detailRequest) return;
          this.allocationSubmitting.set(false);
          this.error.set(
            getApiErrorMessage(
              requestError,
              'تعذر تخصيص الدفعة. تحقق من الرصيد المتبقي والفاتورة.',
            ),
          );
        },
      });
  }

  private loadCurrentView(): void {
    if (this.view() === 'list') this.loadPayments();
    if (this.view() === 'create') this.loadStudentOptions('');
    if (this.view() === 'detail' && this.paymentId()) this.loadPayment(this.paymentId()!);
  }

  private reloadList(): void {
    if (this.workspaceId && this.view() === 'list') {
      this.pagination.update((value) => ({ ...value, page: 1 }));
      this.loadPayments();
    }
  }

  private loadPayments(): void {
    const requestId = ++this.listRequest;
    const from = this.fromFilter.value ? localDateBoundaryToIso(this.fromFilter.value) : null;
    const to = this.toFilter.value ? localDateBoundaryToIso(this.toFilter.value, true) : null;
    if ((this.fromFilter.value && !from) || (this.toFilter.value && !to)) {
      this.error.set('أدخل فترة زمنية صحيحة بالتوقيت المحلي.');
      this.paymentRows.set([]);
      this.loading.set(false);
      return;
    }
    if (
      this.fromFilter.value &&
      this.toFilter.value &&
      this.toFilter.value < this.fromFilter.value
    ) {
      this.error.set('يجب أن يكون تاريخ النهاية مساويًا لتاريخ البداية أو بعده.');
      this.paymentRows.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const current = this.pagination();
    const query: PaymentQuery = {
      page: current.page,
      pageSize: current.pageSize,
      ...(this.filteredStudentId() ? { studentId: this.filteredStudentId() } : {}),
      ...(this.statusFilter.value ? { status: this.statusFilter.value } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    this.financeService
      .listPayments(this.workspaceId, query)
      .pipe(
        tap((result) => this.pagination.set(result.pagination)),
        switchMap((result) =>
          result.items.length
            ? forkJoin(
                result.items.map((payment) =>
                  this.studentFor(payment.studentId).pipe(map((student) => ({ payment, student }))),
                ),
              )
            : of([] as PaymentRow[]),
        ),
      )
      .subscribe({
        next: (rows) => {
          if (requestId !== this.listRequest) return;
          this.paymentRows.set(rows);
          this.loading.set(false);
        },
        error: (requestError: unknown) => {
          if (requestId !== this.listRequest) return;
          this.loading.set(false);
          this.error.set(getApiErrorMessage(requestError, 'تعذر تحميل قائمة المدفوعات.'));
        },
      });
  }

  private loadStudentOptions(search: string): void {
    if (!this.workspaceId || this.view() === 'detail') return;
    const requestId = ++this.studentSearchRequest;
    this.studentsLoading.set(true);
    this.studentOptionsError.set('');
    const page = this.studentPagination();
    this.peopleService
      .listStudents(this.workspaceId, {
        page: page.page,
        pageSize: page.pageSize,
        search: search.trim() || undefined,
      })
      .subscribe({
        next: (result) => {
          if (requestId !== this.studentSearchRequest) return;
          result.items.forEach((value) => this.studentCache.set(value.id, value));
          this.studentOptions.set(result.items);
          this.studentPagination.set(result.pagination);
          this.studentsLoading.set(false);
        },
        error: (requestError: unknown) => {
          if (requestId !== this.studentSearchRequest) return;
          this.studentsLoading.set(false);
          this.studentOptionsError.set(
            getApiErrorMessage(requestError, 'تعذر تحميل قائمة الطلاب.'),
          );
        },
      });
  }

  private loadInvoiceOptions(studentId: string): void {
    const requestId = ++this.invoiceOptionsRequest;
    this.invoiceOptionsLoading.set(true);
    this.invoiceOptionsError.set('');
    const page = this.invoicePagination();
    this.financeService
      .listInvoices(this.workspaceId, {
        page: page.page,
        pageSize: page.pageSize,
        studentId,
        status: 'issued',
      })
      .subscribe({
        next: (result) => {
          if (requestId !== this.invoiceOptionsRequest) return;
          this.invoiceOptions.set(
            result.items.filter((invoice) => isPositiveDecimalString(invoice.outstandingAmount)),
          );
          this.invoicePagination.set(result.pagination);
          this.invoiceOptionsLoading.set(false);
        },
        error: (requestError: unknown) => {
          if (requestId !== this.invoiceOptionsRequest) return;
          this.invoiceOptionsLoading.set(false);
          this.invoiceOptionsError.set(
            getApiErrorMessage(requestError, 'تعذر تحميل الفواتير الصادرة للطالب.'),
          );
        },
      });
  }

  private loadPayment(paymentId: string): void {
    const requestId = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.detailError.set('');
    this.allocationsError.set('');
    this.payment.set(null);
    this.student.set(null);
    this.allocations.set([]);
    this.allocationsLoading.set(false);
    this.financeService.getPayment(this.workspaceId, paymentId).subscribe({
      next: (payment) => {
        if (requestId !== this.detailRequest) return;
        this.payment.set(payment);
        this.detailsLoading.set(false);
        this.studentFor(payment.studentId).subscribe({
          next: (value) => {
            if (requestId === this.detailRequest) this.student.set(value);
          },
          error: (requestError: unknown) => {
            if (requestId === this.detailRequest) {
              this.detailError.set(getApiErrorMessage(requestError, 'تعذر تحميل بيانات الطالب.'));
            }
          },
        });
        this.loadAllocations(payment.id, requestId);
      },
      error: (requestError: unknown) => {
        if (requestId !== this.detailRequest) return;
        this.detailsLoading.set(false);
        this.detailError.set(getApiErrorMessage(requestError, 'تعذر تحميل بيانات الدفعة.'));
      },
    });
  }

  private resetPaymentDetail(): void {
    this.detailRequest++;
    this.invoiceOptionsRequest++;
    this.payment.set(null);
    this.student.set(null);
    this.allocations.set([]);
    this.latestAllocatedInvoice.set(null);
    this.detailsLoading.set(false);
    this.allocationsLoading.set(false);
    this.invoiceOptionsLoading.set(false);
    this.allocationOpen.set(false);
    this.allocationSubmitting.set(false);
    this.detailError.set('');
    this.allocationsError.set('');
    this.invoiceOptionsError.set('');
    this.error.set('');
    this.success.set('');
    this.selectedInvoice.set(null);
    this.invoiceOptions.set([]);
    this.allocationForm.reset({ invoiceId: '', amount: '' });
  }

  private loadAllocations(paymentId: string, requestId: number): void {
    this.allocationsLoading.set(true);
    this.allocations.set([]);
    this.financeService.listPaymentAllocations(this.workspaceId, paymentId).subscribe({
      next: (items) => {
        if (requestId !== this.detailRequest) return;
        this.allocations.set(items);
        this.allocationsLoading.set(false);
      },
      error: (requestError: unknown) => {
        if (requestId !== this.detailRequest) return;
        this.allocationsLoading.set(false);
        this.allocationsError.set(getApiErrorMessage(requestError, 'تعذر تحميل تخصيصات الدفعة.'));
      },
    });
  }

  private studentFor(studentId: string) {
    const cached = this.studentCache.get(studentId);
    if (cached) return of(cached);
    return this.peopleService
      .getStudent(this.workspaceId, studentId)
      .pipe(tap((value) => this.studentCache.set(studentId, value)));
  }
}
