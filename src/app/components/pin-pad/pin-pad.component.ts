import { Component, NO_ERRORS_SCHEMA, EventEmitter, Output } from '@angular/core';
import { isAndroid } from '@nativescript/core';
import { ICON } from '../../ui/icons';

interface Key {
  glyph: string;
  digit: string;
  aux: boolean;
}

const KEYS: Key[] = [
  { glyph: '1', digit: '1', aux: false },
  { glyph: '2', digit: '2', aux: false },
  { glyph: '3', digit: '3', aux: false },
  { glyph: '4', digit: '4', aux: false },
  { glyph: '5', digit: '5', aux: false },
  { glyph: '6', digit: '6', aux: false },
  { glyph: '7', digit: '7', aux: false },
  { glyph: '8', digit: '8', aux: false },
  { glyph: '9', digit: '9', aux: false },
  { glyph: '', digit: '', aux: true },
  { glyph: '0', digit: '0', aux: false },
  { glyph: ICON.backspace, digit: 'back', aux: true },
];

/**
 * Numeric keypad for PIN entry / confirmation.
 * Quiet keys are invisible, the backspace is an icon.
 * Fires a light haptic tick on every press (Android).
 */
@Component({
  selector: 'app-pin-pad',
  standalone: true,
  template: `
    <GridLayout rows="auto,auto,auto,auto" columns="*,*,*" class="pin-pad">
      @for (k of keys; track $index) {
        <Label
          [text]="k.glyph"
          [row]="rowOf($index)"
          [col]="colOf($index)"
          class="pin-key ic"
          [class.pin-key-aux]="k.aux"
          [visibility]="k.glyph === '' ? 'collapse' : 'visible'"
          (tap)="onPress(k, $event)"></Label>
      }
    </GridLayout>
  `,
  imports: [],
  schemas: [NO_ERRORS_SCHEMA],
})
export class PinPadComponent {
  @Output() digit = new EventEmitter<string>();
  @Output() backspace = new EventEmitter<void>();

  readonly keys = KEYS;
  readonly ic = ICON;

  rowOf(i: number): number {
    return Math.floor(i / 3);
  }

  colOf(i: number): number {
    return i % 3;
  }

  onPress(k: Key, args: any): void {
    if (!k.digit) return;
    this.haptic(args);
    if (k.digit === 'back') this.backspace.emit();
    else this.digit.emit(k.digit);
  }

  private haptic(args: any): void {
    if (!isAndroid) return;
    try {
      const view = args && args.object && args.object.nativeViewProtected;
      if (view && view.performHapticFeedback) {
        view.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
      }
    } catch (e) {
      // Haptics are a nicety only.
    }
  }
}
