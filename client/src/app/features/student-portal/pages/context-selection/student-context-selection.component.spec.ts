import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LucideBookOpen, LucideUsersRound, provideLucideIcons } from '@lucide/angular';
import { signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { StudentContextService } from '../../../../core/services/student-context.service';
import { StudentContextSelectionComponent } from './student-context-selection.component';

describe('StudentContextSelectionComponent', () => {
  let fixture: ComponentFixture<StudentContextSelectionComponent>;
  let contextService: {
    contexts: ReturnType<typeof signal>;
    selectedContext: ReturnType<typeof signal>;
    loadState: ReturnType<typeof signal>;
    selectionLoading: ReturnType<typeof signal>;
    selectionError: ReturnType<typeof signal>;
    selectionWasStale: ReturnType<typeof signal>;
    storageWarning: ReturnType<typeof signal>;
    getActiveContexts: ReturnType<typeof vi.fn>;
    selectContext: ReturnType<typeof vi.fn>;
  };

  const createFixture = async (load: () => Observable<unknown>) => {
    contextService = {
      contexts: signal([]),
      selectedContext: signal(null),
      loadState: signal('idle'),
      selectionLoading: signal(false),
      selectionError: signal(''),
      selectionWasStale: signal(false),
      storageWarning: signal(''),
      getActiveContexts: vi.fn(load),
      selectContext: vi.fn(() => of(null)),
    };

    await TestBed.configureTestingModule({
      imports: [StudentContextSelectionComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideLucideIcons(LucideBookOpen, LucideUsersRound),
        { provide: StudentContextService, useValue: contextService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudentContextSelectionComponent);
    fixture.detectChanges();
  };

  it('renders a distinct empty state when the backend confirms no active contexts', async () => {
    await createFixture(() => {
      contextService.loadState.set('ready');
      return of([]);
    });

    expect(fixture.nativeElement.textContent).toContain('لا يوجد ملف طالب نشط');
    expect(fixture.nativeElement.textContent).not.toContain('تعذّر تحميل ملفات الطالب');
  });

  it('renders a retryable error instead of presenting a server failure as an empty result', async () => {
    await createFixture(() => {
      contextService.loadState.set('error');
      return throwError(() => new HttpErrorResponse({ status: 503 }));
    });

    expect(fixture.nativeElement.textContent).toContain('تعذّر تحميل ملفات الطالب');
    expect(fixture.nativeElement.textContent).not.toContain('لا يوجد ملف طالب نشط');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain(
      'إعادة المحاولة',
    );
  });

  it('renders each backend-validated context as an independent selection', async () => {
    const availableContexts = [
      {
        studentAccountLinkId: 'link-a',
        studentName: 'Student A',
        workspaceName: 'Workspace A',
      },
      {
        studentAccountLinkId: 'link-b',
        studentName: 'Student B',
        workspaceName: 'Workspace B',
      },
    ];
    await createFixture(() => {
      contextService.contexts.set(availableContexts);
      contextService.loadState.set('ready');
      return of(availableContexts);
    });

    expect(fixture.nativeElement.textContent).toContain('Student A');
    expect(fixture.nativeElement.textContent).toContain('Workspace A');
    expect(fixture.nativeElement.textContent).toContain('Student B');
    expect(fixture.nativeElement.querySelectorAll('button[type="button"]').length).toBe(2);
  });
});
