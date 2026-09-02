import { Injectable, signal } from '@angular/core';
import { SecureStorage } from '@nativescript/secure-storage';
import { BiometricAuth, BiometricIDAvailableResult, ERROR_CODES } from '@nativescript/biometrics';
import { canonicalPattern, hashSecret, randomHex } from './crypto.util';

export type LockMethod = 'password' | 'pin' | 'pattern';

const K_SALT = 'sv.salt';
const K_HASH = 'sv.hash';
const K_METHOD = 'sv.method';
const K_PINLEN = 'sv.pinlen';
const K_BIO = 'sv.bio';
const K_FAILS = 'sv.fails';
const K_COOLDOWN = 'sv.cooldown';

/**
 * Owns the app lock: the current method (password / PIN / pattern),
 * secret verification (salted & iterated SHA-256), biometric unlock,
 * brute-force protection (5 attempts -> 30 s cooldown) and the
 * lock-on-every-minimize behaviour (no grace period).
 */
@Injectable({ providedIn: 'root' })
export class LockService {
  /** Active lock method. */
  readonly method = signal<LockMethod>('password');
  /** Whether the vault is currently open. */
  readonly unlocked = signal(false);
  /** Device has usable biometrics (fingerprint / face). */
  readonly bioAvailable = signal(false);
  /** Biometric unlock is switched on. */
  readonly bioEnabled = signal(false);
  /** Number of digits for a PIN lock. */
  readonly pinLength = signal(4);
  /** Epoch ms until which verification is blocked. */
  readonly cooldownUntil = signal(0);
  /** Attempts remaining before the cooldown kicks in. */
  readonly failsLeft = signal(5);

  static readonly MAX_FAILS = 5;
  static readonly COOLDOWN_MS = 30000;

  private ss = new SecureStorage();
  private bio = new BiometricAuth();
  private pausedAt = 0;
  private skipNextResumeLock = false;

  /** (Re)loads persisted state. Call on app start and after setup changes. */
  init(): void {
    const m = this.ss.getSync({ key: K_METHOD });
    if (m === 'pin' || m === 'pattern' || m === 'password') {
      this.method.set(m);
    } else {
      this.method.set('password');
    }
    const pinLen = parseInt(this.ss.getSync({ key: K_PINLEN }) || '', 10);
    this.pinLength.set(!isNaN(pinLen) && pinLen >= 4 && pinLen <= 6 ? pinLen : 4);
    this.bioEnabled.set(this.ss.getSync({ key: K_BIO }) === '1');
    const fails = parseInt(this.ss.getSync({ key: K_FAILS }) || '0', 10);
    this.failsLeft.set(Math.max(0, LockService.MAX_FAILS - (isNaN(fails) ? 0 : fails)));
    const until = parseInt(this.ss.getSync({ key: K_COOLDOWN }) || '0', 10);
    this.cooldownUntil.set(isNaN(until) ? 0 : until);
    this.bio.available()
      .then((r: BiometricIDAvailableResult) => this.bioAvailable.set(!!(r && r.any)))
      .catch(() => this.bioAvailable.set(false));
  }

  /** True when a vault secret has been created. */
  isSetup(): boolean {
    try {
      return !!this.ss.getSync({ key: K_HASH });
    } catch (e) {
      return false;
    }
  }

  /** Creates the vault lock for the first time. */
  async setup(secret: string, method: LockMethod, enableBio: boolean): Promise<void> {
    const salt = randomHex(16);
    const hash = hashSecret(this.normalize(secret, method), salt);
    this.ss.setSync({ key: K_SALT, value: salt });
    this.ss.setSync({ key: K_HASH, value: hash });
    this.ss.setSync({ key: K_METHOD, value: method });
    this.ss.setSync({ key: K_PINLEN, value: String(secret.length) });
    this.ss.setSync({ key: K_BIO, value: enableBio ? '1' : '0' });
    this.ss.setSync({ key: K_FAILS, value: '0' });
    this.ss.removeSync({ key: K_COOLDOWN });
    this.unlocked.set(true);
    this.init();
  }

  /** Replaces the current secret / method (keeps the biometric setting). */
  async changeSecret(secret: string, method: LockMethod): Promise<void> {
    await this.setup(secret, method, this.bioEnabled());
  }

  setBioEnabled(enabled: boolean): void {
    this.ss.setSync({ key: K_BIO, value: enabled ? '1' : '0' });
    this.bioEnabled.set(enabled);
  }

  private normalize(secret: string, method: LockMethod): string {
    return method === 'pattern' ? canonicalPattern(secret) : secret;
  }

  /** Verifies a secret. Returns false on mismatch or during a cooldown. */
  async verify(secret: string): Promise<boolean> {
    const until = this.cooldownUntil();
    if (until && until > Date.now()) return false;

    const hash = this.ss.getSync({ key: K_HASH });
    const salt = this.ss.getSync({ key: K_SALT }) || '';
    const expected = hashSecret(this.normalize(secret, this.method()), salt);

    if (hash && expected === hash) {
      this.ss.setSync({ key: K_FAILS, value: '0' });
      this.failsLeft.set(LockService.MAX_FAILS);
      this.unlocked.set(true);
      return true;
    }

    const fails = parseInt(this.ss.getSync({ key: K_FAILS }) || '0', 10);
    const n = (isNaN(fails) ? 0 : fails) + 1;
    if (n >= LockService.MAX_FAILS) {
      const untilTs = Date.now() + LockService.COOLDOWN_MS;
      this.ss.setSync({ key: K_COOLDOWN, value: String(untilTs) });
      this.ss.setSync({ key: K_FAILS, value: '0' });
      this.cooldownUntil.set(untilTs);
      this.failsLeft.set(0);
    } else {
      this.ss.setSync({ key: K_FAILS, value: String(n) });
      this.failsLeft.set(LockService.MAX_FAILS - n);
    }
    return false;
  }

  /**
   * Runs the system biometric prompt.
   * Resolves 'ok' | 'cancelled' | 'failed'.
   */
  async biometricUnlock(): Promise<'ok' | 'cancelled' | 'failed'> {
    try {
      const avail = await this.bio.available();
      if (!avail || !avail.any) return 'failed';
      const result = await this.bio.verifyBiometric({
        title: 'SecuVault',
        message: 'Unlock your vault',
        fallbackMessage: 'Use your secret instead',
        pinFallback: false,
      });
      if (result && result.code === ERROR_CODES.SUCCESS) {
        this.unlocked.set(true);
        this.ss.setSync({ key: K_FAILS, value: '0' });
        this.failsLeft.set(LockService.MAX_FAILS);
        return 'ok';
      }
      if (result && result.code === ERROR_CODES.USER_CANCELLED) return 'cancelled';
      return 'failed';
    } catch (e) {
      return 'failed';
    }
  }

  lock(): void {
    this.unlocked.set(false);
  }

  /**
   * The vault locks on EVERY background stint - there is no grace
   * period. Called from the app-level suspend handler.
   */
  onBackground(): void {
    this.pausedAt = Date.now();
    this.lock();
  }

  /**
   * One-shot: do not lock on the next resume. Used when the app was
   * only backgrounded by an in-flight system flow we started
   * ourselves (the document picker) - the user has not left the
   * workflow, so demanding the secret would interrupt it.
   */
  suppressNextResumeLock(): void {
    this.skipNextResumeLock = true;
  }

  /**
   * True when returning from the background requires the secret
   * again - which is always, unless the stint was suppressed
   * (picker round-trip) or the vault is not set up / unlocked.
   */
  onResumeShouldLock(): boolean {
    if (this.skipNextResumeLock) {
      this.skipNextResumeLock = false;
      return false;
    }
    if (!this.isSetup()) return false;
    return this.pausedAt > 0;
  }

  /** Remaining cooldown in ms (0 when none). */
  cooldownRemaining(): number {
    const left = this.cooldownUntil() - Date.now();
    return left > 0 ? left : 0;
  }

  /** Wipes the lock entirely (keeps the files unless the vault is erased too). */
  resetAll(): void {
    [K_SALT, K_HASH, K_METHOD, K_PINLEN, K_BIO, K_FAILS, K_COOLDOWN].forEach((k) => {
      try {
        this.ss.removeSync({ key: k });
      } catch (e) {
        // ignore
      }
    });
    this.unlocked.set(false);
    this.init();
  }
}
