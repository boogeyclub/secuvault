import { Component, NO_ERRORS_SCHEMA, inject, signal, computed, OnInit } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { VaultService } from '../../services/vault.service';
import { LockService } from '../../services/lock.service';
import { PickerService } from '../../services/picker.service';
import { VaultEntry, Category } from '../../models';
import { I18nService } from '../../i18n/i18n.service';
import { ICON } from '../../ui/icons';

type SortMode = 'newest' | 'oldest' | 'name' | 'largest';

const CATEGORIES: Category[] = ['image', 'video', 'audio', 'document', 'archive', 'other'];

/**
 * The vault: searchable / filterable / sortable file list or grid,
 * import with progress, selection action-mode, restore to
 * Downloads and delete.
 */
@Component({
  selector: 'app-vault',
  standalone: true,
  templateUrl: './vault.component.html',
  imports: [NativeScriptCommonModule, NativeScriptRouterModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class VaultComponent implements OnInit {
  private vault = inject(VaultService);
  private lock = inject(LockService);
  private picker = inject(PickerService);
  private router = inject(RouterExtensions);
  readonly i18n = inject(I18nService);
  readonly ic = ICON;

  readonly entries = this.vault.entries;
  readonly gridView = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly progress = signal<{ done: number; total: number; current: string } | null>(null);
  readonly banner = signal<{ kind: 'ok' | 'err'; text: string } | null>(null);

  readonly search = signal('');
  readonly filter = signal<'all' | Category>('all');
  readonly sort = signal<SortMode>('newest');

  readonly stats = computed(() => this.vault.stats());
  readonly selectionMode = computed(() => this.selectedIds().size > 0);
  readonly selectedCount = computed(() => this.selectedIds().size);

  /** Entries after search + category filter + sort. */
  readonly visibleEntries = computed<VaultEntry[]>(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    const sort = this.sort();
    let list = this.entries().filter((e) => {
      if (f !== 'all' && e.category !== f) return false;
      if (q && e.name.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.addedAt - b.addedAt;
        case 'name':
          return a.name.localeCompare(b.name, this.i18n.locale());
        case 'largest':
          return b.size - a.size;
        default:
          return b.addedAt - a.addedAt;
      }
    });
    return list;
  });

  /** Categories actually present in the vault (for the filter chips). */
  readonly presentCategories = computed<Category[]>(() => {
    const set = new Set<Category>();
    for (const e of this.entries()) set.add(e.category);
    return CATEGORIES.filter((c) => set.has(c));
  });

  readonly categoryCounts = computed<Map<string, number>>(() => {
    const m = new Map<string, number>();
    for (const e of this.entries()) m.set(e.category, (m.get(e.category) || 0) + 1);
    return m;
  });

  private bannerTimer: any = null;

  ngOnInit(): void {
    this.vault.init();
    // Handoff from the dashboard quick action: open the picker
    // right after this screen appears.
    if (this.vault.consumeAutoAdd()) {
      setTimeout(() => this.addFiles(), 150);
    }
  }

  // ---------- display helpers ----------

  countLabel(): string {
    return this.i18n.t('vault.count', { n: this.entries().length });
  }

  bytesLabel(): string {
    return this.i18n.fmtBytes(this.stats().bytes);
  }

  percent(): number {
    const p = this.progress();
    if (!p || p.total <= 0) return 0;
    return Math.min(100, Math.round((p.done / p.total) * 100));
  }

  progressText(): string {
    const p = this.progress();
    if (!p) return '';
    return this.i18n.t(p.current ? 'vault.importing' : 'vault.import.preparing', { name: p.current });
  }

  catLabel(c: 'all' | Category): string {
    if (c === 'all') return this.i18n.t('cat.all');
    return this.i18n.t(
      c === 'image' ? 'cat.image'
        : c === 'video' ? 'cat.video'
        : c === 'audio' ? 'cat.audio'
        : c === 'document' ? 'cat.document'
        : c === 'archive' ? 'cat.archive'
        : 'cat.other'
    );
  }

  catIcon(e: VaultEntry): string {
    switch (e.category) {
      case 'image': return this.ic.image;
      case 'video': return this.ic.video;
      case 'audio': return this.ic.audio;
      case 'document': return this.ic.doc;
      case 'archive': return this.ic.archive;
      default: return this.ic.file;
    }
  }

  catClass(e: VaultEntry): string {
    return 'cat-' + e.category;
  }

  countOf(c: 'all' | Category): number {
    return c === 'all' ? this.entries().length : this.categoryCounts().get(c) || 0;
  }

  metaOf(e: VaultEntry): string {
    return [this.i18n.fmtBytes(e.size), this.catLabel(e.category), this.i18n.fmtDate(e.addedAt)].join('  ·  ');
  }

  fmtSizeOf(e: VaultEntry): string {
    return this.i18n.fmtBytes(e.size) + '  ·  ' + this.i18n.fmtDate(e.addedAt);
  }

  // ---------- search / filter / sort ----------

  onSearch(args: any): void {
    this.search.set(((args.object && args.object.text) || '').trim());
  }

  clearSearch(): void {
    this.search.set('');
  }

  // ---------- import ----------

  async addFiles(): Promise<void> {
    if (this.progress()) return;
    let uris: android.net.Uri[];
    try {
      uris = await this.picker.pickFiles('*/*');
    } catch (e) {
      this.showBanner('err', this.i18n.t('vault.banner.pickerErr'));
      return;
    }
    if (!uris || uris.length === 0) return;

    this.progress.set({ done: 0, total: 1, current: '' });
    try {
      const res = await this.vault.importUris(uris, (p) => this.progress.set(p));
      if (res.imported.length > 0) {
        const movedNote =
          res.moved > 0 ? ' ' + this.i18n.t('vault.banner.moved', { n: res.moved }) : '';
        this.showBanner(
          'ok',
          this.i18n.t('vault.banner.imported', { n: res.imported.length }) + movedNote
        );
      }
      if (res.failed.length > 0) {
        this.showBanner('err', this.i18n.t('vault.banner.importFailed', { n: res.failed.length }));
      }
    } catch (e) {
      this.showBanner('err', this.i18n.t('vault.banner.importErr'));
    } finally {
      this.progress.set(null);
    }
  }

  // ---------- sort ----------

  async chooseSort(): Promise<void> {
    const labels: SortMode[] = ['newest', 'oldest', 'name', 'largest'];
    const options = labels.map((m) => this.sortLabel(m));
    try {
      const res = await Dialogs.action({
        title: this.i18n.t('vault.sort.title'),
        cancelButtonText: this.i18n.t('common.cancel'),
        actions: options,
      });
      const idx = options.indexOf(res);
      if (idx >= 0) this.sort.set(labels[idx]);
    } catch (e) {
      /* dialog dismissed */
    }
  }

  sortLabel(m: SortMode): string {
    return this.i18n.t(
      m === 'newest' ? 'vault.sort.newest'
        : m === 'oldest' ? 'vault.sort.oldest'
        : m === 'name' ? 'vault.sort.name'
        : 'vault.sort.largest'
    );
  }

  // ---------- selection ----------

  openEntry(e: VaultEntry): void {
    if (this.selectionMode()) {
      this.toggleSelect(e);
      return;
    }
    this.router.navigate(['/file', e.id]);
  }

  onLongPress(e: VaultEntry): void {
    if (this.selectionMode()) return;
    this.selectedIds.set(new Set([e.id]));
  }

  toggleSelect(e: VaultEntry): void {
    const s = new Set(this.selectedIds());
    if (s.has(e.id)) s.delete(e.id);
    else s.add(e.id);
    this.selectedIds.set(s);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  async restoreSelected(): Promise<void> {
    const ids = [...this.selectedIds()];
    this.clearSelection();
    let ok = 0;
    for (const e of this.entries()) {
      if (ids.indexOf(e.id) < 0) continue;
      if (await this.vault.restoreToDownloads(e)) ok++;
    }
    if (ok > 0) this.showBanner('ok', this.i18n.t('vault.banner.restored', { n: ok }));
    else this.showBanner('err', this.i18n.t('vault.banner.restoreErr'));
  }

  async deleteSelected(): Promise<void> {
    const ids = [...this.selectedIds()];
    const ok = await Dialogs.confirm({
      title: this.i18n.t('vault.delete.title'),
      message: this.i18n.t('vault.delete.msg', { n: ids.length }),
      okButtonText: this.i18n.t('common.delete'),
      cancelButtonText: this.i18n.t('common.cancel'),
    });
    if (!ok) return;
    this.clearSelection();
    await this.vault.deleteEntries(ids);
    this.showBanner('ok', this.i18n.t('vault.banner.deleted', { n: ids.length }));
  }

  async eraseAll(): Promise<void> {
    const ok = await Dialogs.confirm({
      title: this.i18n.t('vault.erase.title'),
      message: this.i18n.t('vault.erase.msg'),
      okButtonText: this.i18n.t('vault.erase.ok'),
      cancelButtonText: this.i18n.t('common.cancel'),
    });
    if (!ok) return;
    await this.vault.eraseAll();
    this.showBanner('ok', this.i18n.t('vault.banner.erased'));
  }

  lockNow(): void {
    this.lock.lock();
    this.router.navigate(['/lock'], { clearHistory: true });
  }

  openSettings(): void {
    this.router.navigate(['/settings']);
  }

  goHome(): void {
    this.router.navigate(['/home'], { clearHistory: true });
  }

  thumbOf(e: VaultEntry): string {
    return this.vault.thumbPathOf(e);
  }

  private showBanner(kind: 'ok' | 'err', text: string): void {
    this.banner.set({ kind, text });
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      const b = this.banner();
      if (b && b.text === text) this.banner.set(null);
    }, 4000);
  }
}
