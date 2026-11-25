import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { Enrollment, EnrollmentQuery, StudyGroup } from '../../core/models/learning.models';
import {
  Invoice,
  InvoiceQuery,
  InvoiceStatus,
  InvoiceUpdate,
  PaymentAllocation,
} from '../../core/models/finance.models';
import { Student } from '../../core/models/people.models';
import { FinanceService } from '../../core/services/finance.service';
import { LearningService } from '../../core/services/learning.service';
import { PeopleService } from '../../core/services/people.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { getApiErrorMessage } from '../../core/utils/api-error';
import { formatFinanceTimestamp, formatMoneyExact } from '../../core/utils/finance';
import { localDateTimeToIso } from '../../core/utils/local-date-time';

type InvoiceView = 'list' | 'create' | 'detail';

interface InvoiceRow {
  invoice: Invoice;
  student: Student;
}

interface EnrollmentOption {
  enrollment: Enrollment;
  group: StudyGroup;
}

const INVOICE_STATUSES: ReadonlyArray<{ value: InvoiceStatus; label: string }> = [
  { value: 'draft', label: 'مسودة' },
  { value: 'issued', label: 'صادرة' },
  { value: 'void', label: 'ملغاة' },
];

const periodRangeValidator: ValidatorFn = (control) => {
  const start = control.get('periodStart')?.value;
  const end = control.get('periodEnd')?.value;
  return typeof start === 'string' && typeof end === 'string' && start && end && end < start
    ? { invalidPeriodRange: true }
    : null;
};

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './invoices.component.html',
})
export class InvoicesComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly financeService = inject(FinanceService);
  private readonly learningService = inject(LearningService);
  private readonly peopleService = inject(PeopleService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statuses = INVOICE_STATUSES;
  readonly view = signal<InvoiceView>('list');
  readonly invoiceId = signal<string | null>(null);
  readonly invoice = signal<Invoice | null>(null);
  readonly invoiceRows = signal<InvoiceRow[]>([]);
  readonly student = signal<Student | null>(null);
  readonly enrollmentOption = signal<EnrollmentOption | null>(null);
  readonly allocations = signal<PaymentAllocation[]>([]);
  readonly studentSearch = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<InvoiceStatus | ''>('', { nonNullable: true });
  readonly fromFilter = new FormControl('', { nonNullable: true });
  readonly toFilter = new FormControl('', { nonNullable: true });
  readonly studentOptions = signal<Student[]>([]);
  readonly studentPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly enrollmentOptions = signal<EnrollmentOption[]>([]);
  readonly enrollmentPagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly pagination = signal({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
  readonly loading = signal(false);
  readonly detailsLoading = signal(false);
  readonly detailInfoLoading = signal(false);
  readonly allocationsLoading = signal(false);
  readonly studentsLoading = signal(false);
  readonly enrollmentsLoading = signal(false);
  readonly submitting = signal(false);
  readonly actionBusy = signal('');
  readonly editing = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly allocationsError = signal('');
  readonly studentOptionsError = signal('');
  readonly enrollmentsError = signal('');
  readonly success = signal('');
  readonly filteredStudentId = signal('');

  readonly invoiceForm = this.formBuilder.nonNullable.group(
    {
      studentId: ['', Validators.required],
      enrollmentId: ['', Validators.required],
      periodStart: ['', Validators.required],
      periodEnd: ['', Validators.required],
      dueDate: [''],
      description: ['', Validators.maxLength(500)],
      notes: ['', Validators.maxLength(2000)],
    },
    { validators: periodRangeValidator },
  );

  private workspaceId = '';
  private listRequest = 0;
  private detailRequest = 0;
  private studentSearchRequest = 0;
  private enrollmentRequest = 0;
  private readonly studentCache = new Map<string, Student>();
  private readonly groupCache = new Map<string, StudyGroup>();

  constructor() {
    const routePath = this.route.snapshot.routeConfig?.path ?? '';
    const id = this.route.snapshot.paramMap.get('invoiceId');
    this.view.set(routePath === 'invoices/new' ? 'create' : id ? 'detail' : 'list');
    this.invoiceId.set(id);
    this.filteredStudentId.set(this.route.snapshot.queryParamMap.get('studentId') ?? '');
    const requestedStatus = this.route.snapshot.queryParamMap.get('status');
    if (INVOICE_STATUSES.some((status) => status.value === requestedStatus)) {
      this.statusFilter.setValue(requestedStatus as InvoiceStatus);
    }

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const studentId = params.get('studentId') ?? '';
      const statusValue = params.get('status') ?? '';
      const status = INVOICE_STATUSES.some((item) => item.value === statusValue)
        ? (statusValue as InvoiceStatus)
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
            const message = 'لا توجد مساحة عمل نشطة لإدارة الفواتير.';
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

  statusLabel(status: InvoiceStatus): string {
    return INVOICE_STATUSES.find((item) => item.value === status)?.label ?? status;
  }

  paymentStatusLabel(status: Invoice['paymentStatus']): string {
    if (status === 'paid') return 'مدفوعة';
    if (status === 'partially_paid') return 'مدفوعة جزئيًا';
    if (status === 'unpaid') return 'غير مدفوعة';
    return 'غير منطبق';
  }

  setInvoicePage(page: number): void {
    const current = this.pagination();
    if (page < 1 || page > current.totalPages || page === current.page) return;
    this.pagination.update((value) => ({ ...value, page }));
    this.loadInvoices();
  }

  setStudentPage(page: number): void {
    const current = this.studentPagination();
    if (page < 1 || page > current.totalPages || page === current.page) return;
    this.studentPagination.update((value) => ({ ...value, page }));
    this.loadStudentOptions(this.studentSearch.value);
  }

  setEnrollmentPage(page: number): void {
    const current = this.enrollmentPagination();
    if (page < 1 || page > current.totalPages || page === current.page) return;
    this.enrollmentPagination.update((value) => ({ ...value, page }));
    const studentId = this.invoiceForm.controls.studentId.value;
    if (studentId) this.loadEnrollmentOptions(studentId);
  }

  selectStudent(value: Student): void {
    this.student.set(value);
    this.studentCache.set(value.id, value);
    this.invoiceForm.controls.studentId.setValue(value.id);
    this.invoiceForm.controls.enrollmentId.setValue('');
    this.enrollmentOption.set(null);
    this.enrollmentOptions.set([]);
    this.enrollmentPagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.enrollmentPagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.loadEnrollmentOptions(value.id);
  }

  selectEnrollment(value: EnrollmentOption): void {
    this.enrollmentOption.set(value);
    this.invoiceForm.controls.enrollmentId.setValue(value.enrollment.id);
  }

  submitInvoice(): void {
    if (this.submitting()) return;
    this.error.set('');
    this.success.set('');
    if (this.invoiceForm.invalid) {
      this.invoiceForm.markAllAsTouched();
      return;
    }
    const value = this.invoiceForm.getRawValue();
    if (this.view() === 'create') {
      const input = {
        studentId: value.studentId,
        enrollmentId: value.enrollmentId,
        periodStart: value.periodStart,
        periodEnd: value.periodEnd,
        ...(value.dueDate ? { dueDate: localDateTimeToIso(value.dueDate) ?? undefined } : {}),
        ...(value.description.trim() ? { description: value.description.trim() } : {}),
        ...(value.notes.trim() ? { notes: value.notes.trim() } : {}),
      };
      if (value.dueDate && !input.dueDate) {
        this.error.set('أدخل تاريخ استحقاق صحيحًا بالتوقيت المحلي.');
        return;
      }
      this.submitting.set(true);
      this.financeService.createInvoice(this.workspaceId, input).subscribe({
        next: (created) => {
          this.submitting.set(false);
          this.success.set('تم إنشاء مسودة الفاتورة من الخادم.');
          void this.router.navigateByUrl(`/invoices/${encodeURIComponent(created.id)}`);
        },
        error: (requestError: unknown) => {
          this.submitting.set(false);
          this.error.set(getApiErrorMessage(requestError, 'تعذر إنشاء مسودة الفاتورة.'));
        },
      });
      return;
    }

    const current = this.invoice();
    if (!current || current.status !== 'draft') return;
    const update: InvoiceUpdate = {};
    if (value.studentId !== current.studentId) update.studentId = value.studentId;
    if (value.enrollmentId !== current.enrollmentId) update.enrollmentId = value.enrollmentId;
    if (value.periodStart !== current.periodStart) update.periodStart = value.periodStart;
    if (value.periodEnd !== current.periodEnd) update.periodEnd = value.periodEnd;
    if (!Object.keys(update).length) {
      this.editing.set(false);
      this.success.set('لا توجد تغييرات لحفظها.');
      return;
    }
    this.submitting.set(true);
    this.financeService.updateInvoice(this.workspaceId, current.id, update).subscribe({
      next: (updated) => {
        this.invoice.set(updated);
        this.editing.set(false);
        this.submitting.set(false);
        this.success.set('تم تحديث مسودة الفاتورة.');
        this.loadInvoiceReferences(updated);
      },
      error: (requestError: unknown) => {
        this.submitting.set(false);
        this.error.set(getApiErrorMessage(requestError, 'تعذر تحديث مسودة الفاتورة.'));
      },
    });
  }

  beginEdit(): void {
    const current = this.invoice();
    const currentStudent = this.student();
    const currentEnrollment = this.enrollmentOption();
    if (!current || current.status !== 'draft' || !currentStudent) return;
    this.editing.set(true);
    this.error.set('');
    this.studentPagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.studentOptions.set([currentStudent]);
    this.studentSearch.setValue(currentStudent.name, { emitEvent: false });
    this.invoiceForm.patchValue({
      studentId: current.studentId,
      enrollmentId: current.enrollmentId,
      periodStart: current.periodStart,
      periodEnd: current.periodEnd,
    });
    this.enrollmentOptions.set(currentEnrollment ? [currentEnrollment] : []);
    this.enrollmentPagination.set({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    this.loadEnrollmentOptions(current.studentId, currentEnrollment ?? undefined);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.error.set('');
    const current = this.invoice();
    if (current) {
      this.invoiceForm.patchValue({
        studentId: current.studentId,
        enrollmentId: current.enrollmentId,
        periodStart: current.periodStart,
        periodEnd: current.periodEnd,
      });
      this.loadInvoiceReferences(current);
    }
  }

  issue(): void {
    const current = this.invoice();
    if (!current || current.status !== 'draft' || this.actionBusy()) return;
    if (!window.confirm('سيتم إصدار الفاتورة بالقيمة التي يحسبها الخادم. هل تريد المتابعة؟'))
      return;
    this.runInvoiceAction('issue', current.id);
  }

  cancelInvoice(): void {
    const current = this.invoice();
    if (!current || this.actionBusy()) return;
    if (
      current.status === 'void' ||
      (current.status === 'issued' && current.paymentStatus !== 'unpaid')
    )
      return;
    if (!window.confirm('إلغاء الفاتورة إجراء نهائي. هل تريد المتابعة؟')) return;
    this.runInvoiceAction('void', current.id);
  }

  private loadCurrentView(): void {
    if (this.view() === 'list') this.loadInvoices();
    if (this.view() === 'create') this.loadStudentOptions('');
    if (this.view() === 'detail' && this.invoiceId()) this.loadInvoice(this.invoiceId()!);
  }

  private reloadList(): void {
    if (this.workspaceId && this.view() === 'list') {
      this.pagination.update((value) => ({ ...value, page: 1 }));
      this.loadInvoices();
    }
  }

  private loadInvoices(): void {
    const requestId = ++this.listRequest;
    const from = this.fromFilter.value;
    const to = this.toFilter.value;
    if (from && to && to < from) {
      this.error.set('يجب أن يكون تاريخ نهاية الفترة مساويًا لتاريخ البداية أو بعده.');
      this.invoiceRows.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const current = this.pagination();
    const query: InvoiceQuery = {
      page: current.page,
      pageSize: current.pageSize,
      ...(this.filteredStudentId() ? { studentId: this.filteredStudentId() } : {}),
      ...(this.statusFilter.value ? { status: this.statusFilter.value } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    };
    this.financeService
      .listInvoices(this.workspaceId, query)
      .pipe(
        switchMap((result) => {
          this.pagination.set(result.pagination);
          return result.items.length
            ? forkJoin(
                result.items.map((invoice) =>
                  this.studentFor(invoice.studentId).pipe(map((student) => ({ invoice, student }))),
                ),
              )
            : of([] as InvoiceRow[]);
        }),
      )
      .subscribe({
        next: (rows) => {
          if (requestId !== this.listRequest) return;
          this.invoiceRows.set(rows);
          this.loading.set(false);
        },
        error: (requestError: unknown) => {
          if (requestId !== this.listRequest) return;
          this.loading.set(false);
          this.error.set(
            getApiErrorMessage(
              requestError,
              'تعذر تحميل قائمة الفواتير وبيانات الطلاب المرتبطة بها.',
            ),
          );
        },
      });
  }

  private loadStudentOptions(search: string): void {
    if (!this.workspaceId || (this.view() === 'detail' && !this.editing())) return;
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

  private loadEnrollmentOptions(studentId: string, currentOption?: EnrollmentOption): void {
    const requestId = ++this.enrollmentRequest;
    this.enrollmentsLoading.set(true);
    this.enrollmentsError.set('');
    const pagination = this.enrollmentPagination();
    const query: EnrollmentQuery = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      studentId,
      ...(this.view() === 'create' ? { status: 'active' as const } : {}),
    };
    this.learningService.listEnrollments(this.workspaceId, query).subscribe({
      next: (result) => {
        const options$ = result.items.length
          ? forkJoin(
              result.items.map((enrollment) =>
                this.groupFor(enrollment.groupId).pipe(map((group) => ({ enrollment, group }))),
              ),
            )
          : of([] as EnrollmentOption[]);
        options$.subscribe({
          next: (options) => {
            if (requestId !== this.enrollmentRequest) return;
            const combined =
              currentOption &&
              !options.some((option) => option.enrollment.id === currentOption.enrollment.id)
                ? [currentOption, ...options]
                : options;
            this.enrollmentOptions.set(combined);
            this.enrollmentPagination.set(result.pagination);
            const selected = combined.find(
              (option) => option.enrollment.id === this.invoiceForm.controls.enrollmentId.value,
            );
            if (selected) this.enrollmentOption.set(selected);
            this.enrollmentsLoading.set(false);
          },
          error: (requestError: unknown) => {
            if (requestId !== this.enrollmentRequest) return;
            this.enrollmentsLoading.set(false);
            this.enrollmentsError.set(
              getApiErrorMessage(requestError, 'تعذر تحميل التسجيلات المرتبطة بالطالب.'),
            );
          },
        });
      },
      error: (requestError: unknown) => {
        if (requestId !== this.enrollmentRequest) return;
        this.enrollmentsLoading.set(false);
        this.enrollmentsError.set(
          getApiErrorMessage(requestError, 'تعذر تحميل التسجيلات المرتبطة بالطالب.'),
        );
      },
    });
  }

  private loadInvoice(invoiceId: string): void {
    const requestId = ++this.detailRequest;
    this.detailsLoading.set(true);
    this.detailError.set('');
    this.allocationsError.set('');
    this.invoice.set(null);
    this.financeService.getInvoice(this.workspaceId, invoiceId).subscribe({
      next: (invoice) => {
        if (requestId !== this.detailRequest) return;
        this.invoice.set(invoice);
        this.detailsLoading.set(false);
        this.loadInvoiceReferences(invoice);
        this.loadInvoiceAllocations(invoice.id, requestId);
      },
      error: (requestError: unknown) => {
        if (requestId !== this.detailRequest) return;
        this.detailsLoading.set(false);
        this.detailError.set(getApiErrorMessage(requestError, 'تعذر تحميل بيانات الفاتورة.'));
      },
    });
  }

  private loadInvoiceReferences(invoice: Invoice): void {
    this.detailInfoLoading.set(true);
    this.detailError.set('');
    forkJoin({
      student: this.studentFor(invoice.studentId),
      enrollment: this.learningService.getEnrollment(this.workspaceId, invoice.enrollmentId),
      group: this.groupFor(invoice.groupId),
    }).subscribe({
      next: ({ student, enrollment, group }) => {
        this.student.set(student);
        this.enrollmentOption.set({ enrollment, group });
        this.detailInfoLoading.set(false);
      },
      error: (requestError: unknown) => {
        this.detailInfoLoading.set(false);
        this.detailError.set(getApiErrorMessage(requestError, 'تعذر تحميل مراجع الفاتورة.'));
      },
    });
  }

  private loadInvoiceAllocations(invoiceId: string, requestId: number): void {
    this.allocationsLoading.set(true);
    this.financeService.listInvoiceAllocations(this.workspaceId, invoiceId).subscribe({
      next: (items) => {
        if (requestId !== this.detailRequest) return;
        this.allocations.set(items);
        this.allocationsLoading.set(false);
      },
      error: (requestError: unknown) => {
        if (requestId !== this.detailRequest) return;
        this.allocationsLoading.set(false);
        this.allocationsError.set(getApiErrorMessage(requestError, 'تعذر تحميل تخصيصات الفاتورة.'));
      },
    });
  }

  private runInvoiceAction(action: 'issue' | 'void', invoiceId: string): void {
    this.actionBusy.set(action);
    this.error.set('');
    const request: Observable<Invoice> =
      action === 'issue'
        ? this.financeService.issueInvoice(this.workspaceId, invoiceId)
        : this.financeService.voidInvoice(this.workspaceId, invoiceId);
    request.subscribe({
      next: (updated) => {
        this.invoice.set(updated);
        this.actionBusy.set('');
        this.success.set(action === 'issue' ? 'تم إصدار الفاتورة.' : 'تم إلغاء الفاتورة.');
        this.editing.set(false);
        this.loadInvoiceReferences(updated);
        this.loadInvoiceAllocations(updated.id, this.detailRequest);
      },
      error: (requestError: unknown) => {
        this.actionBusy.set('');
        this.error.set(getApiErrorMessage(requestError, 'تعذر تنفيذ الإجراء على الفاتورة.'));
      },
    });
  }

  private studentFor(studentId: string): Observable<Student> {
    const cached = this.studentCache.get(studentId);
    if (cached) return of(cached);
    return this.peopleService
      .getStudent(this.workspaceId, studentId)
      .pipe(tap((value) => this.studentCache.set(studentId, value)));
  }

  private groupFor(groupId: string): Observable<StudyGroup> {
    const cached = this.groupCache.get(groupId);
    if (cached) return of(cached);
    return this.learningService
      .getGroup(this.workspaceId, groupId)
      .pipe(tap((value) => this.groupCache.set(groupId, value)));
  }
}
