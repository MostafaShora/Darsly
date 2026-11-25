import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const trimmedMinLength = (minimumLength: number): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    if (!value || value.length >= minimumLength) return null;
    return {
      minlength: {
        requiredLength: minimumLength,
        actualLength: value.length,
      },
    };
  };
};

export const trimmedRequired: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' && control.value.trim().length > 0
    ? null
    : { required: true };
