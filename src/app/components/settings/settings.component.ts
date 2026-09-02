import { Component, NO_ERRORS_SCHEMA, inject, computed } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { LockService, LockMethod } from '../../services/lock.service';
import { VaultService } from '../../services/vault.service';
import { I18nService } from '../../i18n/i18n.service';
import { ICON } from '../../ui/icons';
import { LangToggleComponent } from '../lang-toggle/lang-toggle.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  imports: [NativeScriptCommonModule, NativeScriptRouterModule, LangToggleComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SettingsComponent {
  private lock = inject(LockService);
  private vault = inject(VaultService);
  private router = inject(RouterExtensions);
  readonly i18n = inject(I18nService);
  readonly ic = ICON;

  readonly method = this.lock.method;
  readonly bioAvailable = this.lock.bioAvailable;
  readonly bioEnabled = this.lock.bioEnabled;
  readonly stats = computed(() => this.vault.stats());

  methodLabel(): string {
    const m = this.method();
    return this.i18n.t(
      m === 'password' ? 'setup.method.password' : m === 'pin' ? 'setup.method.pin' : 'setup.method.pattern'
    );
  }

  methodIcon(): string {
    const m: LockMethod = this.method();
    return m === 'password' ? this.ic.keyOutline : m === 'pin' ? this.ic.dialpad : this.ic.gesture;
  }

  storageLabel(): string {
    return (
      this.i18n.t('vault.count', { n: this.stats().count }) + '  ·  ' + this.i18n.fmtBytes(this.stats().bytes)
    );
  }

  changeLock(): void {
    this.router.navigate(['/setup-change']);
  }

  onBioChange(args: any): void {
    const on = !!(args.object && args.object.checked);
    this.lock.setBioEnabled(on);
  }

  async eraseAll(): Promise<void> {
    const ok = await Dialogs.confirm({
      title: this.i18n.t('vault.erase.title'),
      message: this.i18n.t('vault.erase.msg'),
      okButtonText: this.i18n.t('vault.erase.ok'),
      cancelButtonText: this.i18n.t('common.cancel'),
    });
    if (!ok) return;
    await this.vault.eraseAll();
    this.router.navigate(['/vault'], { clearHistory: true });
  }

  async resetApp(): Promise<void> {
    const ok = await Dialogs.confirm({
      title: this.i18n.t('settings.reset.title'),
      message: this.i18n.t('settings.reset.msg'),
      okButtonText: this.i18n.t('settings.reset.ok'),
      cancelButtonText: this.i18n.t('common.cancel'),
    });
    if (!ok) return;
    await this.vault.eraseAll();
    this.lock.resetAll();
    this.router.navigate(['/welcome'], { clearHistory: true });
  }

  back(): void {
    this.router.navigate(['/vault'], { clearHistory: true });
  }
}
