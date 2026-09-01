import { Component, NO_ERRORS_SCHEMA, EventEmitter, Output } from '@angular/core';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Numeric keypad used for PIN entry and PIN confirmation.
 */
@Component({
  selector: 'app-pin-pad',
  standalone: true,
  template: `
    <GridLayout rows="auto,auto,auto,auto" columns="*,*,*" class="pin-pad">
      @for (k of keys; track k) {
        <Button
          [text]="k"
          [row]="rowOf(k)"
          [col]="colOf(k)"
          [isEnabled]="k !== ''"
          class="pin-key"
          (tap)="onPress(k)"></Button>
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

  rowOf(k: string): number {
    return Math.floor(this.keys.indexOf(k) / 3);
  }

  colOf(k: string): number {
    return this.keys.indexOf(k) % 3;
  }

  onPress(k: string): void {
    if (!k) return;
    if (k === '⌫') this.backspace.emit();
    else this.digit.emit(k);
  }
}
