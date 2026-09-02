import { Component, NO_ERRORS_SCHEMA, inject, computed, OnInit } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { VaultService } from '../../services/vault.service';
import { LockService } from '../../services/lock.service';
import { Category } from '../../models';
import { I18nService } from '../../i18n/i18n.service';
import { ICON } from '../../ui/icons';
import { LangToggleComponent } from '../lang-toggle/lang-toggle.component';

/**
 * Dashboard - the hub shown right after unlocking. Every workflow
 * of the app is reachable from here in one tap:
 *
 *   ACCESS        Files (browse / import / manage)
 *   QUICK         Add files · Lock now
 *   MANAGE        Settings · Change lock · Language
 *   PROTECTION    live status of the active safeguards
 */
@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.component.html',
  imports: [NativeScriptCommonModule, NativeScriptRouterModule, LangToggleComponent],
  schemas: [NO_ERRORS_SCHEMA],
})
export class HomeComponent implements OnInit {
  private vault = inject(VaultService);
  private lock = inject(LockService);
  private router = inject(RouterExtensions);
  readonly i18n = inject(I18nService);
  readonly ic = ICON;

  readonly entries = this.vault.entries;
  readonly stats = computed(() => this.vault.stats());
  readonly method = this.lock.method;
  readonly bioEnabled = this.lock.bioEnabled;
  readonly bioAvailable = this.lock.bioAvailable;

  /** Categories present in the vault, with counts (for the Files card). */
  readonly categoryCounts = computed<Map<Category, number>>(() => {
    const m = new Map<Category, number>();
    for (const e of this.entries()) m.set(e.category, (m.get(e.category) || 0) + 1);
    return m;
  });
  readonly presentCategories = computed<Category[]>(() =>
    [...this.categoryCounts().keys()].sort()
  );

  ngOnInit(): void {
    this.vault.init();
  }

  // ---------- display helpers ----------

  filesSummary(): string {
    const n = this.entries().length;
    if (n === 0) return this.i18n.t('home.files.empty');
    return this.i18n.t('vault.count', { n }) + '  ·  ' + this.i18n.fmtBytes(this.stats().bytes);
  }

  catLabel(c: Category): string {
    return this.i18n.t(
      c === 'image' ? 'cat.image'
        : c === 'video' ? 'cat.video'
        : c === 'audio' ? 'cat.audio'
        : c === 'document' ? 'cat.document'
        : c === 'archive' ? 'cat.archive'
        : 'cat.other'
    );
  }

  catIcon(c: Category): string {
    switch (c) {
      case 'image': return this.ic.image;
      case 'video': return this.ic.video;
      case 'audio': return this.ic.audio;
      case 'document': return this.ic.doc;
      case 'archive': return this.ic.archive;
      default: return this.ic.file;
    }
  }

  catClass(c: Category): string {
    return 'cat-' + c;
  }

  countOf(c: Category): number {
    return this.categoryCounts().get(c) || 0;
  }

  methodIcon(): string {
    const m = this.method();
    return m === 'password' ? this.ic.keyOutline : m === 'pin' ? this.ic.dialpad : this.ic.gesture;
  }

  // ---------- navigation / actions ----------

  openFiles(): void {
    this.router.navigate(['/vault']);
  }

  addFiles(): void {
    // The vault screen owns the picker flow - ask it to open the
    // system picker as soon as it appears.
    this.vault.requestAutoAdd();
    this.router.navigate(['/vault']);
  }

  lockNow(): void {
    this.lock.lock();
    this.router.navigate(['/lock'], { clearHistory: true });
  }

  openSettings(): void {
    this.router.navigate(['/settings']);
  }

  changeLock(): void {
    this.router.navigate(['/setup-change']);
  }
}
