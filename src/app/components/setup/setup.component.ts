import { Component, NO_ERRORS_SCHEMA, inject, signal, OnInit, ViewChild } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule, RouterExtensions } from '@nativescript/angular';
import { ActivatedRoute } from '@angular/router';
import { PinPadComponent } from '../pin-pad/pin-pad.component';
import { PatternLockComponent } from '../pattern-lock/pattern-lock.component';
import { LockService, LockMethod } from '../../services/lock.service';

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

  title(): string {
    if (this.changeMode()) return 'Change lock';
    return 'Create your vault';
  }

  subtitle(): string {
    if (this.step() === 'method') return 'Choose how you want to unlock SecuVault.';
    if (this.step() === 'enter') return this.enterPrompt();
    return 'Repeat it once more to confirm.';
  }

  enterPrompt(): string {
    const m = this.chosen();
    if (m === 'password') return 'Choose a password (6+ characters).';
    if (m === 'pin') return 'Choose a 4–6 digit PIN.';
    return 'Draw a pattern — at least 4 dots.';
  }

  methodLabel(m: LockMethod): string {
    return m === 'password' ? 'Password' : m === 'pin' ? 'PIN code' : 'Pattern';
  }

  methodHint(m: LockMethod): string {
    if (m === 'password') return 'Words, numbers and symbols. Strongest option.';
    if (m === 'pin') return 'A fast 4–6 digit numeric code.';
    return 'Draw a shape on the 3×3 dot grid.';
  }

  choose(m: LockMethod): void {
    this.chosen.set(m);
    this.error.set('');
  }

  continueFromMethod(): void {
    if (!this.chosen()) {
      this.error.set('Pick a lock method first.');
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
      this.error.set(m === 'pattern' ? 'Patterns do not match — try again.' : 'They do not match — try again.');
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
      this.error.set('Something went wrong while saving. Please try again.');
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
