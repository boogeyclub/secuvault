import { Component, NO_ERRORS_SCHEMA, inject, signal, OnInit, ViewChild } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { PinPadComponent } from '../pin-pad/pin-pad.component';
import { PatternLockComponent } from '../pattern-lock/pattern-lock.component';
import { LockService } from '../../services/lock.service';
import { VaultService } from '../../services/vault.service';

/**
 * Lock screen. Adapts to the active lock method:
 * password field, PIN keypad or pattern grid, plus an optional
 * fingerprint button and a reset link for a forgotten secret.
 */
@Component({
  selector: 'app-lock',
  standalone: true,
  templateUrl: './lock.component.html',
  imports: [NativeScriptCommonModule, NativeScriptRouterModule, PinPadComponent, PatternLockComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class LockComponent implements OnInit {
  private lock = inject(LockService);
  private vault = inject(VaultService);
  private router = inject(RouterExtensions);

  readonly method = this.lock.method;
  readonly bioAvailable = this.lock.bioAvailable;
  readonly bioEnabled = this.lock.bioEnabled;
  readonly pinLength = this.lock.pinLength;

  readonly error = signal('');
  readonly busy = signal(false);
  readonly pinEntered = signal('');
  readonly patternDraft = signal('');
  readonly showPassword = signal(false);
  readonly cooldownSecs = signal(0);

  password = '';

  @ViewChild('pattern') patternCmp?: PatternLockComponent;

  private cooldownTimer: any = null;

  ngOnInit(): void {
    if (!this.lock.isSetup()) {
      this.router.navigate(['/welcome'], { clearHistory: true });
      return;
    }
    const left = this.lock.cooldownRemaining();
    if (left > 0) this.startCooldown();
    if (this.lock.bioEnabled() && this.lock.bioAvailable()) {
      setTimeout(() => this.tryBio(), 400);
    }
  }

  titleText(): string {
    const m = this.method();
    if (m === 'password') return 'Enter your password';
    if (m === 'pin') return 'Enter your PIN';
    return 'Draw your pattern';
  }

  methodLabel(): string {
    const m = this.method();
    return m === 'password' ? 'password' : m === 'pin' ? 'PIN' : 'pattern';
  }

  async tryBio(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const res = await this.lock.biometricUnlock();
    this.busy.set(false);
    if (res === 'ok') {
      this.error.set('');
      this.router.navigate(['/vault'], { clearHistory: true });
    } else if (res === 'failed' && this.lock.bioEnabled()) {
      this.error.set('Fingerprint not recognized — use your ' + this.methodLabel() + '.');
    }
  }

  async submit(): Promise<void> {
    if (this.busy() || this.cooldownSecs() > 0) return;
    this.busy.set(true);

    let secret = '';
    const m = this.method();
    if (m === 'password') secret = this.password;
    else if (m === 'pin') secret = this.pinEntered();
    else secret = this.patternDraft();

    const ok = await this.lock.verify(secret);
    this.busy.set(false);

    if (ok) {
      this.error.set('');
      this.router.navigate(['/vault'], { clearHistory: true });
      return;
    }
    if (this.lock.cooldownRemaining() > 0) {
      this.startCooldown();
      return;
    }
    this.error.set('Wrong ' + this.methodLabel() + '. ' + this.lock.failsLeft() + ' attempt(s) left.');
    this.password = '';
    this.pinEntered.set('');
    this.patternDraft.set('');
    this.patternCmp?.clear();
  }

  onPasswordChange(args: any): void {
    this.password = (args.object && args.object.text) || '';
  }

  onPinDigit(d: string): void {
    if (this.cooldownSecs() > 0) return;
    const cur = this.pinEntered();
    if (cur.length >= this.pinLength()) return;
    this.pinEntered.set(cur + d);
    if (this.pinEntered().length === this.pinLength()) {
      setTimeout(() => this.submit(), 130);
    }
  }

  onPinBack(): void {
    this.pinEntered.set(this.pinEntered().slice(0, -1));
  }

  onPattern(seq: string): void {
    this.patternDraft.set(seq);
  }

  pinSlots(): number[] {
    const out: number[] = [];
    for (let i = 1; i <= this.pinLength(); i++) out.push(i);
    return out;
  }

  private startCooldown(): void {
    const tick = () => {
      const left = Math.ceil(this.lock.cooldownRemaining() / 1000);
      this.cooldownSecs.set(left);
      if (left <= 0) {
        if (this.cooldownTimer) clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
        this.error.set('');
      }
    };
    tick();
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(tick, 500);
  }

  async resetVault(): Promise<void> {
    const ok = await Dialogs.confirm({
      title: 'Reset SecuVault',
      message:
        'You will lose your lock AND every file inside the vault. There is no way to undo this. Continue?',
      okButtonText: 'Erase everything',
      cancelButtonText: 'Cancel',
    });
    if (!ok) return;
    await this.vault.eraseAll();
    this.lock.resetAll();
    this.router.navigate(['/welcome'], { clearHistory: true });
  }
}
