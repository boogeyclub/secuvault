import { Component, NO_ERRORS_SCHEMA, inject, signal, OnInit } from '@angular/core';
import { NativeScriptCommonModule, NativeScriptRouterModule, RouterExtensions } from '@nativescript/angular';
import { ActivatedRoute } from '@angular/router';
import { Dialogs, Utils } from '@nativescript/core';
import { VaultService } from '../../services/vault.service';
import { VaultEntry } from '../../models';
import { I18nService } from '../../i18n/i18n.service';
import { ICON } from '../../ui/icons';

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
  readonly i18n = inject(I18nService);
  readonly ic = ICON;

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

  pathOf(e: VaultEntry): string {
    return this.vault.filePathOf(e);
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

  catLabel(e: VaultEntry): string {
    return this.i18n.t(
      e.category === 'image' ? 'cat.image'
        : e.category === 'video' ? 'cat.video'
        : e.category === 'audio' ? 'cat.audio'
        : e.category === 'document' ? 'cat.document'
        : e.category === 'archive' ? 'cat.archive'
        : 'cat.other'
    );
  }

  sizeOf(e: VaultEntry): string {
    return this.i18n.fmtBytes(e.size);
  }

  dateOf(e: VaultEntry): string {
    return this.i18n.fmtDate(e.addedAt);
  }

  originalLabel(e: VaultEntry): string {
    return this.i18n.t(e.moved ? 'detail.original.deleted' : 'detail.original.kept');
  }

  movedNote(e: VaultEntry): string {
    return this.i18n.t(e.moved ? 'detail.note.deleted' : 'detail.note.kept');
  }

  openInSystem(): void {
    const e = this.entry();
    if (!e) return;
    try {
      const ok = Utils.openFile(this.vault.filePathOf(e));
      if (!ok) this.showBanner('err', this.i18n.t('detail.banner.openErr'));
    } catch (err) {
      this.showBanner('err', this.i18n.t('detail.banner.openFail'));
    }
  }

  async restore(): Promise<void> {
    const e = this.entry();
    if (!e) return;
    const ok = await this.vault.restoreToDownloads(e);
    if (ok) this.showBanner('ok', this.i18n.t('detail.banner.restored'));
    else this.showBanner('err', this.i18n.t('detail.banner.restoreErr'));
  }

  async remove(): Promise<void> {
    const e = this.entry();
    if (!e) return;
    const ok = await Dialogs.confirm({
      title: this.i18n.t('detail.delete.title'),
      message: this.i18n.t('detail.delete.msg', { name: e.name }),
      okButtonText: this.i18n.t('common.delete'),
      cancelButtonText: this.i18n.t('common.cancel'),
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
