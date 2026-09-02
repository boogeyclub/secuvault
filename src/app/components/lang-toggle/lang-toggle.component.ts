import { Component, NO_ERRORS_SCHEMA, inject } from '@angular/core';
import { I18nService, Locale } from '../../i18n/i18n.service';

/**
 * Small EN | FR segmented control. Used on the welcome screen
 * (first run) and in Settings. Each option is labelled in its
 * own language, as is conventional.
 */
@Component({
  selector: 'app-lang-toggle',
  standalone: true,
  template: `
    <GridLayout columns="auto,auto" class="seg">
      <Label
        col="0"
        text="English"
        class="seg-item"
        [class.seg-item-on]="i18n.locale() === 'en'"
        (tap)="set('en')"></Label>
      <Label
        col="1"
        text="Français"
        class="seg-item"
        [class.seg-item-on]="i18n.locale() === 'fr'"
        (tap)="set('fr')"></Label>
    </GridLayout>
  `,
  imports: [],
  schemas: [NO_ERRORS_SCHEMA],
})
export class LangToggleComponent {
  readonly i18n = inject(I18nService);

  set(l: Locale): void {
    this.i18n.setLocale(l);
  }
}
