import { Component, NO_ERRORS_SCHEMA, EventEmitter, Output, signal, computed } from '@angular/core';

const SIDE = 280; // pattern area in dp
const DOT = 52; // dot size in dp
const CENTERS = [72, 140, 208]; // dot centers along both axes

interface Dot {
  i: number; // 1..9 (1 = top-left, 9 = bottom-right)
  cx: number;
  cy: number;
  left: number;
  top: number;
}

const DOTS: Dot[] = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    const i = r * 3 + c + 1;
    DOTS.push({ i, cx: CENTERS[c], cy: CENTERS[r], left: CENTERS[c] - DOT / 2, top: CENTERS[r] - DOT / 2 });
  }
}

interface Line {
  key: string;
  left: number;
  top: number;
  width: number;
  angle: number;
}

/**
 * Tap-based 3x3 pattern lock (no canvas needed - pure views).
 * Tap dots in order; tapping an earlier dot again truncates the
 * pattern. Emits the current sequence (e.g. "1596") on every change.
 */
@Component({
  selector: 'app-pattern-lock',
  standalone: true,
  template: `
    <GridLayout width="{{SIDE}}" height="{{SIDE}}" class="pattern-area">
      <AbsoluteLayout>
        @for (l of lines(); track l.key) {
          <Label class="pattern-line" [left]="l.left" [top]="l.top" [width]="l.width" height="3" [rotate]="l.angle"></Label>
        }
        @for (d of dots; track d.i) {
          <GridLayout
            [left]="d.left"
            [top]="d.top"
            width="52"
            height="52"
            class="dot"
            [class.dot-selected]="isSelected(d.i)"
            [class.dot-last]="last() === d.i"
            (tap)="toggle(d.i)">
            @if (orderOf(d.i) > 0) {
              <Label [text]="'' + orderOf(d.i)" class="dot-num"></Label>
            }
          </GridLayout>
        }
      </AbsoluteLayout>
    </GridLayout>
  `,
  imports: [],
  schemas: [NO_ERRORS_SCHEMA],
})
export class PatternLockComponent {
  @Output() pattern = new EventEmitter<string>();

  readonly dots = DOTS;
  readonly SIDE = SIDE;

  readonly selected = signal<number[]>([]);

  readonly lines = computed<Line[]>(() => {
    const sel = this.selected();
    const out: Line[] = [];
    for (let k = 1; k < sel.length; k++) {
      const a = DOTS[sel[k - 1] - 1];
      const b = DOTS[sel[k] - 1];
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      out.push({
        key: sel[k - 1] + '-' + sel[k],
        left: (a.cx + b.cx) / 2 - len / 2,
        top: (a.cy + b.cy) / 2 - 1.5,
        width: len,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      });
    }
    return out;
  });

  readonly last = computed<number>(() => {
    const s = this.selected();
    return s.length ? s[s.length - 1] : -1;
  });

  isSelected(i: number): boolean {
    return this.selected().includes(i);
  }

  orderOf(i: number): number {
    const idx = this.selected().indexOf(i);
    return idx < 0 ? -1 : idx + 1;
  }

  toggle(i: number): void {
    const sel = [...this.selected()];
    const idx = sel.indexOf(i);
    if (idx >= 0) {
      this.selected.set(sel.slice(0, idx + 1));
    } else {
      sel.push(i);
      this.selected.set(sel);
    }
    this.pattern.emit(this.selected().join(''));
  }

  /** Resets the drawing (after a failed attempt). */
  clear(): void {
    this.selected.set([]);
    this.pattern.emit('');
  }

  /** Current sequence as a string of dot numbers. */
  value(): string {
    return this.selected().join('');
  }
}
