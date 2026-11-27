import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Optional,
  Output,
  Self,
  ViewChild,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NgControl, Validators } from '@angular/forms';

export interface CustomSelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'app-custom-select',
  standalone: true,
  templateUrl: './custom-select.component.html',
  host: { class: 'relative block min-w-0' },
})
export class CustomSelectComponent implements ControlValueAccessor {
  private static nextId = 0;

  @Input() controlId = `custom-select-${++CustomSelectComponent.nextId}`;
  @Input() options: readonly CustomSelectOption[] = [];
  @Input() placeholder = '';
  @Input() placeholderValue = '';
  @Input() placeholderDisabled = false;
  @Input() label = '';
  @Input() error = '';
  @Input() ariaLabel = '';
  @Input() describedBy = '';
  @Input() required = false;
  @Input() invalid: boolean | null = null;
  @Input() disabled = false;
  @Input() size: 'default' | 'compact' = 'default';

  @Output() readonly valueChange = new EventEmitter<string>();

  @ViewChild('triggerElement') private triggerElement?: ElementRef<HTMLButtonElement>;

  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);
  readonly currentValue = signal('');
  readonly formDisabled = signal(false);
  readonly panelPosition = signal({ top: 0, left: 0, width: 0, maxHeight: 240 });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    @Optional() @Self() private readonly ngControl: NgControl | null,
  ) {
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  @Input()
  set value(value: string | null | undefined) {
    if (value !== undefined) this.currentValue.set(value ?? '');
  }

  get value(): string {
    return this.currentValue();
  }

  get listboxId(): string {
    return `${this.controlId}-listbox`;
  }

  get selectedLabel(): string {
    if (this.currentValue() === this.placeholderValue && this.placeholder) {
      return this.placeholder;
    }

    return this.options.find((option) => option.value === this.currentValue())?.label ?? this.placeholder;
  }

  get isDisabled(): boolean {
    return this.disabled || this.formDisabled() || !!this.ngControl?.control?.disabled;
  }

  get isRequired(): boolean {
    return this.required || !!this.ngControl?.control?.hasValidator(Validators.required);
  }

  get isInvalid(): boolean {
    if (this.invalid !== null) return this.invalid;
    const control = this.ngControl?.control;
    return !!control?.invalid && (!!control.touched || !!control.dirty);
  }

  get describedByIds(): string | null {
    const ids = [this.describedBy, this.error ? `${this.controlId}-error` : ''].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }

  writeValue(value: unknown): void {
    this.currentValue.set(typeof value === 'string' ? value : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
    if (isDisabled) this.closeMenu();
  }

  optionCount(): number {
    return this.options.length + (this.placeholder ? 1 : 0);
  }

  optionIndex(index: number): number {
    return index + (this.placeholder ? 1 : 0);
  }

  optionId(index: number): string {
    return `${this.controlId}-option-${index}`;
  }

  optionValue(index: number): string {
    if (this.placeholder && index === 0) return this.placeholderValue;
    return this.options[index - (this.placeholder ? 1 : 0)]?.value ?? '';
  }

  optionDisabled(index: number): boolean {
    if (this.placeholder && index === 0) return this.placeholderDisabled;
    return this.options[index - (this.placeholder ? 1 : 0)]?.disabled ?? false;
  }

  isSelected(value: string): boolean {
    return this.currentValue() === value;
  }

  setActiveIndex(index: number): void {
    if (!this.optionDisabled(index)) this.activeIndex.set(index);
  }

  toggleMenu(): void {
    if (this.isDisabled) return;
    if (this.isOpen()) {
      this.closeMenu();
      return;
    }
    this.openMenu();
  }

  openMenu(): void {
    if (this.isDisabled) return;
    this.updatePanelPosition();
    this.isOpen.set(true);

    const selectedIndex = this.findOptionIndex(this.currentValue());
    this.activeIndex.set(
      selectedIndex >= 0 && !this.optionDisabled(selectedIndex)
        ? selectedIndex
        : this.findNextEnabledIndex(-1, 1),
    );
  }

  handleKeydown(event: KeyboardEvent): void {
    if (this.isDisabled) return;

    if (event.key === 'Escape') {
      if (this.isOpen()) {
        event.preventDefault();
        this.closeMenu(true);
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!this.isOpen()) {
        this.openMenu();
        if (direction < 0) {
          this.activeIndex.set(this.findNextEnabledIndex(this.activeIndex(), -1));
        }
      } else {
        this.activeIndex.set(this.findNextEnabledIndex(this.activeIndex(), direction));
      }
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!this.isOpen()) return;
      event.preventDefault();
      this.activeIndex.set(
        this.findNextEnabledIndex(
          event.key === 'Home' ? -1 : this.optionCount(),
          event.key === 'Home' ? 1 : -1,
        ),
      );
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.isOpen()) {
        this.openMenu();
      } else if (this.activeIndex() >= 0) {
        this.selectOption(this.optionValue(this.activeIndex()));
      }
    }
  }

  selectOption(value: string): void {
    const index = this.findOptionIndex(value);
    if (this.isDisabled || index < 0 || this.optionDisabled(index)) return;

    if (value !== this.currentValue()) {
      this.currentValue.set(value);
      this.onChange(value);
      this.valueChange.emit(value);
    }

    this.onTouched();
    this.closeMenu(true);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (!this.isOpen() || this.elementRef.nativeElement.contains(event.target as Node)) return;
    this.onTouched();
    this.closeMenu();
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeOnEscape(event: Event): void {
    if (!this.isOpen()) return;
    event.preventDefault();
    this.closeMenu(true);
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  closeWhenPositionChanges(): void {
    if (this.isOpen()) this.closeMenu();
  }

  @HostListener('focusout', ['$event'])
  markTouchedOnFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !this.elementRef.nativeElement.contains(nextTarget as Node)) {
      this.onTouched();
      if (this.isOpen()) this.closeMenu();
    }
  }

  private findOptionIndex(value: string): number {
    for (let index = 0; index < this.optionCount(); index += 1) {
      if (this.optionValue(index) === value) return index;
    }
    return -1;
  }

  private findNextEnabledIndex(start: number, direction: 1 | -1): number {
    const count = this.optionCount();
    if (!count) return -1;

    for (let offset = 1; offset <= count; offset += 1) {
      const index = (start + direction * offset + count) % count;
      if (!this.optionDisabled(index)) return index;
    }
    return -1;
  }

  private updatePanelPosition(): void {
    const rect = this.triggerElement?.nativeElement.getBoundingClientRect();
    if (!rect) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(rect.width, Math.max(0, viewportWidth - 16));
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const below = Math.max(0, viewportHeight - rect.bottom - 8);
    const above = Math.max(0, rect.top - 8);
    const openAbove = below < 160 && above > below;
    const availableHeight = openAbove ? above : below;
    const maxHeight = Math.max(80, Math.min(240, availableHeight));
    const top = openAbove
      ? Math.max(8, rect.top - maxHeight - 4)
      : Math.min(rect.bottom + 4, viewportHeight - maxHeight - 8);

    this.panelPosition.set({ top, left, width, maxHeight });
  }

  private closeMenu(restoreFocus = false): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    if (restoreFocus) this.triggerElement?.nativeElement.focus();
  }
}
