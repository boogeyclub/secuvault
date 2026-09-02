import { Injectable, computed, signal } from '@angular/core';
import { ApplicationSettings, isAndroid } from '@nativescript/core';
import { en, fr, TranslationKey, TranslationParams } from './translations';

export type Locale = 'en' | 'fr';

/**
 * Base forms of the pluralizable keys: a key pair like
 * `vault.count_one` / `vault.count_other` is addressed as
 * `t('vault.count', { n })`.
 */
type StripSuffix<K extends string> = K extends `${infer B}_one` ? B : never;
export type PluralKey = StripSuffix<TranslationKey>;

const LOCALE_KEY = 'sv.lang';

const MONTHS: Record<Locale, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: [
    'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
  ],
};

const BYTE_UNITS: Record<Locale, string[]> = {
  en: ['B', 'KB', 'MB', 'GB', 'TB'],
  fr: ['o', 'Ko', 'Mo', 'Go', 'To'],
};

/**
 * Global translations + locale formatting.
 *
 * The active locale is a signal; `t()` reads it, so any binding
 * that calls `t(...)` re-renders when the language changes.
 *
 * First launch follows the device language (French locale -> FR,
 * anything else -> EN); afterwards the choice is persisted in the
 * app settings and restored.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>('en');

  /** Current dictionary - a computed so `t()` stays reactive. */
  private readonly dict = computed<Record<TranslationKey, string>>(() =>
    this.locale() === 'fr' ? fr : (en as Record<TranslationKey, string>)
  );

  /** Call once on app start (done by GateComponent / AppComponent). */
  init(): void {
    const saved = ApplicationSettings.getString(LOCALE_KEY, '');
    if (saved === 'en' || saved === 'fr') {
      this.locale.set(saved);
      return;
    }
    this.locale.set(this.deviceLocale());
  }

  setLocale(l: Locale): void {
    this.locale.set(l);
    try {
      ApplicationSettings.setString(LOCALE_KEY, l);
    } catch (e) {
      // Persistence is best-effort; the in-memory locale still switches.
    }
  }

  /** Device language, mapped to a supported locale (default: EN). */
  private deviceLocale(): Locale {
    try {
      if (isAndroid) {
        const tag = (
          java.util.Locale.getDefault().getLanguage() + ''
        ).toLowerCase();
        if (tag.indexOf('fr') === 0) return 'fr';
      }
    } catch (e) {
      /* fall through to EN */
    }
    return 'en';
  }

  /**
   * Translates a key. When `params` contains a number `n` (or `count`)
   * and the dictionary has `key_one` / `key_other` variants, the right
   * plural form is selected using the locale's plural rule
   * (en: 1 => one; fr: 0 or 1 => one).
   */
  t(key: TranslationKey | PluralKey, params?: TranslationParams): string {
    const d = this.dict();
    let k = key as TranslationKey;
    if (params) {
      const n = params['n'];
      if (typeof n === 'number') {
        const one = this.pluralCategory(n);
        const oneKey = (key + '_one') as TranslationKey;
        const otherKey = (key + '_other') as TranslationKey;
        if (one === 'one' && d[oneKey] !== undefined) k = oneKey;
        else if (d[otherKey] !== undefined) k = otherKey;
      }
    }
    let out = d[k] ?? d[key as TranslationKey] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        out = out.split('{' + name + '}').join('' + value);
      }
    }
    return out;
  }

  private pluralCategory(n: number): 'one' | 'other' {
    // CLDR rules for the two supported locales.
    return this.locale() === 'fr' ? (n === 0 || n === 1 ? 'one' : 'other') : n === 1 ? 'one' : 'other';
  }

  /** Locale-aware "Mar 2, 2026 · 14:05" style date. */
  fmtDate(ts: number): string {
    const d = new Date(ts);
    const pad = (x: number) => (x < 10 ? '0' + x : '' + x);
    const months = MONTHS[this.locale()];
    const time = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (this.locale() === 'fr') {
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${time}`;
    }
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${time}`;
  }

  /** Locale-aware byte size ("2.4 MB" / "2,4 Mo"). */
  fmtBytes(n: number): string {
    if (!n || n < 0) return '0 ' + BYTE_UNITS[this.locale()][0];
    const units = BYTE_UNITS[this.locale()];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    const num = i === 0 ? Math.round(v).toString() : v.toFixed(1).replace('.', this.locale() === 'fr' ? ',' : '.');
    return `${num} ${units[i]}`;
  }
}
