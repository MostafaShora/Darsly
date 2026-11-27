import { Component } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-account-type-selection',
  standalone: true,
  imports: [LucideDynamicIcon, RouterLink],
  templateUrl: './account-type-selection.component.html',
})
export class AccountTypeSelectionComponent {}
