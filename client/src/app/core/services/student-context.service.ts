import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap, throwError, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ActiveStudentContext } from '../models/student-context.models';
import { AuthService } from './auth.service';

interface ApiResponse<T> {
  message: string;
  data: T;
}

export type StudentContextLoadState = 'idle' | 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class StudentContextService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly baseUrl = `${environment.apiBaseUrl}/student-contexts`;
  private readonly selectionStoragePrefix = 'darsly.active-student-context.';
  private selectionUserId: string | null = null;

  readonly contexts = signal<ActiveStudentContext[]>([]);
  readonly selectedContext = signal<ActiveStudentContext | null>(null);
  readonly loadState = signal<StudentContextLoadState>('idle');
  readonly selectionLoading = signal(false);
  readonly selectionError = signal('');
  readonly selectionWasStale = signal(false);
  readonly storageWarning = signal('');

  getActiveContexts(): Observable<ActiveStudentContext[]> {
    this.prepareForCurrentUser();
    this.loadState.set('loading');

    return this.http
      .get<ApiResponse<ActiveStudentContext[]>>(this.baseUrl, { withCredentials: true })
      .pipe(
        map((response) => response.data),
        tap((contexts) => {
          this.contexts.set(contexts);
          this.loadState.set('ready');
          const currentId = this.selectedContext()?.studentAccountLinkId;
          if (currentId && !contexts.some((context) => context.studentAccountLinkId === currentId)) {
            this.clearSelection();
            this.selectionWasStale.set(true);
          }

          const storedId = this.getSavedSelectionId();
          if (storedId && !contexts.some((context) => context.studentAccountLinkId === storedId)) {
            this.clearSelection();
            this.selectionWasStale.set(true);
          }
        }),
        catchError((error: unknown) => {
          this.loadState.set('error');
          return throwError(() => error);
        }),
      );
  }

  selectContext(studentAccountLinkId: string): Observable<ActiveStudentContext> {
    this.prepareForCurrentUser();
    this.selectionLoading.set(true);
    this.selectionError.set('');

    return this.http
      .post<ApiResponse<ActiveStudentContext>>(
        `${this.baseUrl}/selection`,
        { studentAccountLinkId },
        { withCredentials: true },
      )
      .pipe(
        map((response) => response.data),
        tap((context) => {
          this.selectedContext.set(context);
          this.selectionWasStale.set(false);
          this.persistSelection(context.studentAccountLinkId);
        }),
        catchError((error: unknown) => {
          this.selectionLoading.set(false);
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.clearSelection();
            this.selectionWasStale.set(true);
            this.selectionError.set(
              'تعذّر الوصول إلى الملف المحدد. حدّث القائمة واختر ملفًا نشطًا.',
            );
          } else {
            this.selectionError.set('تعذّر التحقق من سياق الطالب. حاول مرة أخرى.');
          }
          return throwError(() => error);
        }),
        tap({
          complete: () => this.selectionLoading.set(false),
        }),
      );
  }

  getSavedSelectionId(): string | null {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return null;

    try {
      const selection = globalThis.localStorage?.getItem(this.selectionStorageKey(userId)) ?? null;
      this.storageWarning.set('');
      return selection;
    } catch {
      this.storageWarning.set('تعذّر حفظ اختيار الملف على هذا الجهاز.');
      return null;
    }
  }

  clearSelection(): void {
    this.selectedContext.set(null);
    const userId = this.selectionUserId ?? this.authService.currentUser()?.id;
    if (!userId) return;

    try {
      globalThis.localStorage?.removeItem(this.selectionStorageKey(userId));
      this.storageWarning.set('');
    } catch {
      this.storageWarning.set('تعذّر إزالة اختيار الملف المحفوظ على هذا الجهاز.');
    }
  }

  selectedContextHeaders(): HttpHeaders {
    const context = this.selectedContext();
    if (!context) {
      throw new Error('A backend-validated StudentAccountLink is required.');
    }
    return new HttpHeaders({
      'X-Student-Account-Link': context.studentAccountLinkId,
    });
  }

  private prepareForCurrentUser(): void {
    const userId = this.authService.currentUser()?.id ?? null;
    if (this.selectionUserId === userId) return;

    this.selectionUserId = userId;
    this.selectedContext.set(null);
    this.contexts.set([]);
    this.loadState.set('idle');
    this.selectionError.set('');
    this.selectionWasStale.set(false);
    this.storageWarning.set('');
  }

  private persistSelection(studentAccountLinkId: string): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;

    this.selectionUserId = userId;
    try {
      globalThis.localStorage?.setItem(
        this.selectionStorageKey(userId),
        studentAccountLinkId,
      );
      this.storageWarning.set('');
    } catch {
      this.storageWarning.set(
        'تعذّر حفظ اختيار الملف على هذا الجهاز. سيبقى الاختيار حتى إعادة تحميل الصفحة.',
      );
    }
  }

  private selectionStorageKey(userId: string): string {
    return `${this.selectionStoragePrefix}${encodeURIComponent(userId)}`;
  }
}
