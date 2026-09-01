import { Component, NO_ERRORS_SCHEMA, inject, computed } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { LockService, LockMethod } from '../../services/lock.service';
import { VaultService } from '../../services/vault.service';
import { fmtBytes } from '../../models';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  imports: [NativeScriptCommonModule, NativeScriptRouterModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SettingsComponent {
  private lock = inject(LockService);
  private vault = inject(VaultService);
  private router = inject(RouterExtensions);

  readonly method = this.lock.method;
  readonly bioAvailable = this.lock.bioAvailable;
  readonly bioEnabled = this.lock.bioEnabled;
  readonly stats = computed(() => this.vault.stats());

  methodLabel(): string {
    const m = this.method();
    return m === 'password' ? 'Password' : m === 'pin' ? 'PIN code' : 'Pattern';
  }

  bytesLabel(): string {
    return fmtBytes(this.stats().bytes);
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
      title: 'Erase the vault',
      message: 'Permanently delete EVERY file in the vault? This cannot be undone.',
      okButtonText: 'Erase all',
      cancelButtonText: 'Cancel',
    });
    if (!ok) return;
    await this.vault.eraseAll();
    this.router.navigate(['/vault'], { clearHistory: true });
  }

  async resetApp(): Promise<void> {
    const ok = await Dialogs.confirm({
      title: 'Reset SecuVault',
      message:
        'This removes your lock AND deletes every file in the vault. There is no way to undo this.',
      okButtonText: 'Reset everything',
      cancelButtonText: 'Cancel',
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
