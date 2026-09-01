import { Component, NO_ERRORS_SCHEMA, inject, signal, OnInit } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule, RouterExtensions } from '@nativescript/angular';
import { ActivatedRoute } from '@angular/router';
import { Dialogs, Utils } from '@nativescript/core';
import { VaultService } from '../../services/vault.service';
import { VaultEntry, categoryCode, categoryLabel, fmtBytes, fmtDate } from '../../models';

/**
 * Single file view: preview (for images), metadata and the actions
 * Open / Restore to Downloads / Delete.
 */
@Component({
  selector: 'app-file-detail',
  standalone: true,
  templateUrl: './file-detail.component.html',
  imports: [NativeScriptCommonModule, NativeScriptRouterModule],
  schemas: [NO_ERRORS_SCHEMA],
})
export class FileDetailComponent implements OnInit {
  private vault = inject(VaultService);
  private router = inject(RouterExtensions);
  private route = inject(ActivatedRoute);

  readonly entry = signal<VaultEntry | null>(null);
  readonly banner = signal<{ kind: 'ok' | 'err'; text: string } | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const e = this.vault.entries().find((x) => x.id === id);
    if (!e) {
      this.router.navigate(['/vault'], { clearHistory: true });
      return;
    }
    this.entry.set(e);
  }

  codeOf(e: VaultEntry): string {
    return categoryCode(e.category);
  }

  pathOf(e: VaultEntry): string {
    return this.vault.filePathOf(e);
  }

  labelOf(e: VaultEntry): string {
    return categoryLabel(e.category);
  }

  sizeOf(e: VaultEntry): string {
    return fmtBytes(e.size);
  }

  dateOf(e: VaultEntry): string {
    return fmtDate(e.addedAt);
  }

  movedNote(e: VaultEntry): string {
    return e.moved
      ? 'The original was deleted from your phone when this file was imported.'
      : 'Imported as a copy — the original may still be on your phone.';
  }

  openInSystem(): void {
    const e = this.entry();
    if (!e) return;
    try {
      const ok = Utils.openFile(this.vault.filePathOf(e));
      if (!ok) this.showBanner('err', 'No app on this phone can open this file type.');
    } catch (err) {
      this.showBanner('err', 'Could not open the file.');
    }
  }

  async restore(): Promise<void> {
    const e = this.entry();
    if (!e) return;
    const ok = await this.vault.restoreToDownloads(e);
    if (ok) this.showBanner('ok', 'Restored to Downloads/SecuVault.');
    else this.showBanner('err', 'Could not restore the file.');
  }

  async remove(): Promise<void> {
    const e = this.entry();
    if (!e) return;
    const ok = await Dialogs.confirm({
      title: 'Delete from vault',
      message: 'Delete “' + e.name + '” from the vault? This cannot be undone.',
      okButtonText: 'Delete',
      cancelButtonText: 'Cancel',
    });
    if (!ok) return;
    await this.vault.deleteEntries([e.id]);
    this.router.navigate(['/vault'], { clearHistory: true });
  }

  back(): void {
    this.router.back();
  }

  private showBanner(kind: 'ok' | 'err', text: string): void {
    this.banner.set({ kind, text });
    setTimeout(() => {
      const b = this.banner();
      if (b && b.text === text) this.banner.set(null);
    }, 4000);
  }
}
