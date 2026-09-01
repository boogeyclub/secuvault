import { Component, NO_ERRORS_SCHEMA, inject, signal, computed, OnInit } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule } from '@nativescript/angular';
import { RouterExtensions } from '@nativescript/angular';
import { Dialogs } from '@nativescript/core';
import { VaultService } from '../../services/vault.service';
import { LockService } from '../../services/lock.service';
import { PickerService } from '../../services/picker.service';
import { VaultEntry, categoryCode, fmtBytes, fmtDate } from '../../models';

/**
 * The vault: file list/grid, import with progress, selection mode,
 * restore-to-Downloads and delete.
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

  readonly entries = this.vault.entries;
  readonly gridView = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly progress = signal<{ done: number; total: number; current: string } | null>(null);
  readonly banner = signal<{ kind: 'ok' | 'err'; text: string } | null>(null);

  readonly stats = computed(() => this.vault.stats());
  readonly selectionMode = computed(() => this.selectedIds().size > 0);
  readonly selectedCount = computed(() => this.selectedIds().size);

  private bannerTimer: any = null;

  ngOnInit(): void {
    this.vault.init();
  }

  bytesLabel(): string {
    return fmtBytes(this.stats().bytes);
  }

  percent(): number {
    const p = this.progress();
    if (!p || p.total <= 0) return 0;
    return Math.min(100, Math.round((p.done / p.total) * 100));
  }

  async addFiles(): Promise<void> {
    if (this.progress()) return;
    let uris: android.net.Uri[];
    try {
      uris = await this.picker.pickFiles('*/*');
    } catch (e) {
      this.showBanner('err', 'Could not open the file picker.');
      return;
    }
    if (!uris || uris.length === 0) return;

    this.progress.set({ done: 0, total: 1, current: 'Preparing…' });
    try {
      const res = await this.vault.importUris(uris, (p) => this.progress.set(p));
      if (res.imported.length > 0) {
        const movedNote =
          res.moved > 0 ? ' ' + res.moved + ' original(s) were deleted from your phone.' : '';
        this.showBanner('ok', 'Added ' + res.imported.length + ' file(s) to the vault.' + movedNote);
      }
      if (res.failed.length > 0) {
        this.showBanner('err', res.failed.length + ' file(s) could not be imported.');
      }
    } catch (e) {
      this.showBanner('err', 'Import failed.');
    } finally {
      this.progress.set(null);
    }
  }

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
    if (ok > 0) this.showBanner('ok', ok + ' file(s) restored to Downloads/SecuVault.');
    else this.showBanner('err', 'Could not restore the file(s).');
  }

  async deleteSelected(): Promise<void> {
    const ids = [...this.selectedIds()];
    const ok = await Dialogs.confirm({
      title: 'Delete from vault',
      message:
        'Delete ' + ids.length + ' file(s) from the vault? This cannot be undone.',
      okButtonText: 'Delete',
      cancelButtonText: 'Cancel',
    });
    if (!ok) return;
    this.clearSelection();
    await this.vault.deleteEntries(ids);
    this.showBanner('ok', ids.length + ' file(s) deleted.');
  }

  async eraseAll(): Promise<void> {
    const ok = await Dialogs.confirm({
      title: 'Erase the vault',
      message: 'Permanently delete EVERY file in the vault? This cannot be undone.',
      okButtonText: 'Erase all',
      cancelButtonText: 'Cancel',
    });
    if (!ok) return;
    await this.vault.eraseAll();
    this.showBanner('ok', 'Vault is empty.');
  }

  lockNow(): void {
    this.lock.lock();
    this.router.navigate(['/lock'], { clearHistory: true });
  }

  openSettings(): void {
    this.router.navigate(['/settings']);
  }

  codeOf(e: VaultEntry): string {
    return categoryCode(e.category);
  }

  thumbOf(e: VaultEntry): string {
    return this.vault.thumbPathOf(e);
  }

  metaOf(e: VaultEntry): string {
    const parts = [fmtBytes(e.size)];
    if (e.category === 'image' || e.category === 'video' || e.category === 'audio' || e.category === 'document' || e.category === 'archive') {
      parts.push(e.category.charAt(0).toUpperCase() + e.category.slice(1));
    }
    parts.push(fmtDate(e.addedAt));
    return parts.join('  ·  ');
  }

  fmtSizeOf(e: VaultEntry): string {
    return fmtBytes(e.size) + '  ·  ' + fmtDate(e.addedAt);
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
