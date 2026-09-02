import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { NativeScriptCommonModule } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { I18nService } from '../../i18n/i18n.service';
import { ICON } from '../../ui/icons';
import { LangToggleComponent } from '../lang-toggle/lang-toggle.component';

@Component({
  selector: 'app-welcome',
  standalone: true,
  templateUrl: './welcome.component.html',
  imports: [NativeScriptCommonModule, LangToggleComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class WelcomeComponent {
  private router = inject(RouterExtensions);
  readonly i18n = inject(I18nService);
  readonly ic = ICON;

  start(): void {
    this.router.navigate(['/setup']);
  }
}
