import { Component, NO_ERRORS_SCHEMA, inject, OnInit } from '@angular/core';
import { PageRouterOutlet } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { Application, isAndroid } from '@nativescript/core';
import { LockService } from './services/lock.service';
import { I18nService } from './i18n/i18n.service';

@Component({
  selector: 'ns-app',
  templateUrl: './app.component.html',
  imports: [PageRouterOutlet],
  schemas: [NO_ERRORS_SCHEMA],
})
export class AppComponent implements OnInit {
  private router = inject(RouterExtensions);
  private lock = inject(LockService);
  private i18n = inject(I18nService);

  ngOnInit(): void {
    // Restore the saved language (or follow the device locale).
    this.i18n.init();

    // Block screenshots and the app preview in the Android recents screen.
    if (isAndroid) {
      try {
        const activity = Application.android.startActivity;
        if (activity && activity.getWindow) {
          const flags = android.view.WindowManager.LayoutParams.FLAG_SECURE;
          activity.getWindow().setFlags(flags, flags);
        }
      } catch (e) {
        // FLAG_SECURE is a hardening measure only - never fatal.
      }
    }

    // Auto-lock when the app comes back to the foreground after being
    // away for longer than the grace period (see LockService).
    Application.on(Application.suspendEvent, () => this.lock.onBackground());
    Application.on(Application.resumeEvent, () => {
      if (this.lock.onResumeShouldLock()) {
        this.router.navigate(['/lock'], { clearHistory: true });
      }
    });
  }
}
