import { RelationshipType, StudentStatus } from './people.models';

export const STUDENT_STATUS_OPTIONS: ReadonlyArray<{ value: StudentStatus; label: string }> = [
  { value: 'active', label: 'نشط' },
  { value: 'inactive', label: 'غير نشط' },
  { value: 'archived', label: 'مؤرشف' },
];

export const RELATIONSHIP_OPTIONS: ReadonlyArray<{ value: RelationshipType; label: string }> = [
  { value: 'father', label: 'الأب' },
  { value: 'mother', label: 'الأم' },
  { value: 'brother', label: 'الأخ' },
  { value: 'sister', label: 'الأخت' },
  { value: 'relative', label: 'قريب' },
  { value: 'other', label: 'أخرى' },
];
