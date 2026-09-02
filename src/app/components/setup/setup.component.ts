import { Component, NO_ERRORS_SCHEMA, inject, signal, OnInit, ViewChild } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule, RouterExtensions } from '@nativescript/angular';
import { ActivatedRoute } from '@angular/router';
import { PinPadComponent } from '../pin-pad/pin-pad.component';
import { PatternLockComponent } from '../pattern-lock/pattern-lock.component';
import { LockService, LockMethod } from '../../services/lock.service';
import { I18nService } from '../../i18n/i18n.service';
import { ICON } from '../../ui/icons';

type Step = 'method' | 'enter' | 'confirm';

/**
 * Two-in-one wizard:
 *  - create mode: first-run setup of the vault lock
 *  - change mode: change method / secret from the settings screen
 */
@Component({
  selector: 'app-setup',
  standalone: true,
  templateUrl: './setup.component.html',
  imports: [NativeScriptCommonModule, NativeScriptRouterModule, PinPadComponent, PatternLockComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class SetupComponent implements OnInit {
  private lock = inject(LockService);
  private router = inject(RouterExtensions);
  private route = inject(ActivatedRoute);
  readonly i18n = inject(I18nService);
  readonly ic = ICON;

  /** Public aliases so the template can read the lock state. */
  readonly bioAvailable = this.lock.bioAvailable;

  readonly changeMode = signal(false);
  readonly step = signal<Step>('method');
  readonly chosen = signal<LockMethod | null>(null);
  readonly showSecret = signal(false);
  readonly useBio = signal(false);
  readonly error = signal('');

  passwordFirst = '';
  passwordConfirm = '';
  pinFirst = '';
  pinConfirm = '';
  patternFirst = '';
  patternConfirm = '';

  @ViewChild('firstPattern') firstPattern?: PatternLockComponent;
  @ViewChild('confirmPattern') confirmPattern?: PatternLockComponent;

  ngOnInit(): void {
    this.changeMode.set(this.route.snapshot.data && this.route.snapshot.data['mode'] === 'change');
    this.useBio.set(this.lock.bioAvailable());
  }

  /** 0-based wizard step index for the progress indicator. */
  stepIndex(): number {
    return this.step() === 'method' ? 0 : this.step() === 'enter' ? 1 : 2;
  }

  stepLabel(i: number): string {
    return this.i18n.t(i === 0 ? 'setup.step.method' : i === 1 ? 'setup.step.enter' : 'setup.step.confirm');
  }

  title(): string {
    return this.i18n.t(this.changeMode() ? 'setup.change.title' : 'setup.create.title');
  }

  subtitle(): string {
    if (this.step() === 'method') return this.i18n.t('setup.method.subtitle');
    if (this.step() === 'enter') return this.enterPrompt();
    return this.i18n.t('setup.confirm.subtitle');
  }

  enterPrompt(): string {
    const m = this.chosen();
    if (m === 'password') return this.i18n.t('setup.prompt.password');
    if (m === 'pin') return this.i18n.t('setup.prompt.pin');
    return this.i18n.t('setup.prompt.pattern');
  }

  methodLabel(m: LockMethod): string {
    return this.i18n.t(
      m === 'password' ? 'setup.method.password' : m === 'pin' ? 'setup.method.pin' : 'setup.method.pattern'
    );
  }

  methodHint(m: LockMethod): string {
    return this.i18n.t(
      m === 'password'
        ? 'setup.method.password.hint'
        : m === 'pin'
          ? 'setup.method.pin.hint'
          : 'setup.method.pattern.hint'
    );
  }

  methodIcon(m: LockMethod): string {
    return m === 'password' ? this.ic.keyOutline : m === 'pin' ? this.ic.dialpad : this.ic.gesture;
  }

  choose(m: LockMethod): void {
    this.chosen.set(m);
    this.error.set('');
  }

  continueFromMethod(): void {
    if (!this.chosen()) {
      this.error.set(this.i18n.t('setup.error.pickMethod'));
      return;
    }
    this.step.set('enter');
    this.error.set('');
  }

  isEnterValid(): boolean {
    const m = this.chosen();
    if (m === 'password') return this.passwordFirst.length >= 6;
    if (m === 'pin') return this.pinFirst.length >= 4 && this.pinFirst.length <= 6;
    if (m === 'pattern') return this.patternFirst.length >= 4;
    return false;
  }

  continueFromEnter(): void {
    if (!this.isEnterValid()) {
      this.error.set(this.enterPrompt());
      return;
    }
    this.step.set('confirm');
    this.error.set('');
  }

  isConfirmValid(): boolean {
    const m = this.chosen();
    if (m === 'password') return this.passwordConfirm.length > 0;
    if (m === 'pin') return this.pinConfirm.length > 0;
    if (m === 'pattern') return this.patternConfirm.length >= 4;
    return false;
  }

  patternDotsLabel(n: number): string {
    return this.i18n.t('setup.pattern.dots', { n: Math.max(1, n) });
  }

  async finish(): Promise<void> {
    const m = this.chosen();
    if (!m) return;

    let first = '';
    let confirm = '';
    if (m === 'password') { first = this.passwordFirst; confirm = this.passwordConfirm; }
    else if (m === 'pin') { first = this.pinFirst; confirm = this.pinConfirm; }
    else { first = this.patternFirst; confirm = this.patternConfirm; }

    if (!this.isEnterValid()) { this.error.set(this.enterPrompt()); return; }
    if (!this.isConfirmValid()) { this.error.set(this.enterPrompt()); return; }
    if (first !== confirm) {
      this.error.set(
        m === 'pattern' ? this.i18n.t('setup.error.mismatchPattern') : this.i18n.t('setup.error.mismatch')
      );
      this.pinConfirm = '';
      this.passwordConfirm = '';
      this.patternConfirm = '';
      this.confirmPattern?.clear();
      return;
    }

    try {
      if (this.changeMode()) {
        await this.lock.changeSecret(first, m);
        this.router.back();
      } else {
        await this.lock.setup(first, m, this.useBio());
        this.router.navigate(['/lock'], { clearHistory: true });
      }
    } catch (e) {
      this.error.set(this.i18n.t('setup.error.save'));
    }
  }

  back(): void {
    if (this.step() === 'method') {
      if (this.changeMode()) this.router.back();
      else this.router.navigate(['/welcome']);
      return;
    }
    if (this.step() === 'confirm') {
      this.step.set('enter');
      this.pinConfirm = '';
      this.passwordConfirm = '';
      this.patternConfirm = '';
      this.confirmPattern?.clear();
      this.error.set('');
      return;
    }
    this.step.set('method');
    this.error.set('');
  }

  onFirstPasswordChange(args: any): void {
    this.passwordFirst = (args.object && args.object.text) || '';
  }

  onConfirmPasswordChange(args: any): void {
    this.passwordConfirm = (args.object && args.object.text) || '';
  }

  onFirstPinDigit(d: string): void {
    if (this.pinFirst.length < 6) this.pinFirst += d;
  }

  onFirstPinBack(): void {
    this.pinFirst = this.pinFirst.slice(0, -1);
  }

  onConfirmPinDigit(d: string): void {
    if (this.pinConfirm.length < 6) this.pinConfirm += d;
  }

  onConfirmPinBack(): void {
    this.pinConfirm = this.pinConfirm.slice(0, -1);
  }

  onFirstPattern(seq: string): void {
    this.patternFirst = seq;
  }

  onConfirmPattern(seq: string): void {
    this.patternConfirm = seq;
  }

  pinDots(n: number): number[] {
    const out: number[] = [];
    for (let i = 1; i <= n; i++) out.push(i);
    return out;
  }
}
