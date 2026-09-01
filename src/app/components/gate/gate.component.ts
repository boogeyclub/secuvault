import { Component, NO_ERRORS_SCHEMA, inject, OnInit } from '@angular/core';
import { RouterExtensions } from '@nativescript/angular';
import { LockService } from '../../services/lock.service';

/**
 * Entry gate: decides between first-run setup and the lock screen.
 * Renders nothing itself.
 */
@Component({
  selector: 'app-gate',
  standalone: true,
  template: '<GridLayout class="page"></GridLayout>',
  imports: [],
  schemas: [NO_ERRORS_SCHEMA],
})
export class GateComponent implements OnInit {
  private router = inject(RouterExtensions);
  private lock = inject(LockService);

  ngOnInit(): void {
    this.lock.init();
    if (this.lock.isSetup()) {
      this.router.navigate(['/lock'], { clearHistory: true });
    } else {
      this.router.navigate(['/welcome'], { clearHistory: true });
    }
  }
}
