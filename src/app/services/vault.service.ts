import { Injectable, signal } from '@angular/core';
import { knownFolders, Folder, File, isAndroid, Utils } from '@nativescript/core';
import { VaultEntry, categoryOf, extOf, mimeFor, sanitizeName } from '../models';

export interface ImportProgress {
  done: number;
  total: number;
  current: string;
}

export interface ImportResult {
  imported: VaultEntry[];
  moved: number;
  failed: { name: string; reason: string }[];
}

/**
 * The vault itself.
 *
 * Files are stored inside the app's PRIVATE internal storage
 * (files/vault/files) which no other app, file manager or USB browser
 * can read - that is what hides them from the rest of the phone.
 *
 * On import the file is COPIED into the vault and the original is then
 * deleted from its previous location (a real "move"). Metadata lives in
 * files/vault/index.json; image thumbnails in files/vault/thumbs.
 */
@Injectable({ providedIn: 'root' })
export class VaultService {
  readonly entries = signal<VaultEntry[]>([]);

  private vaultFolder: Folder;
  private filesFolder: Folder;
  private thumbsFolder: Folder;
  private indexFile: File;
  private initialized = false;
  private autoAddRequested = false;

  constructor() {
    this.vaultFolder = knownFolders.currentApp().getFolder('vault');
    this.filesFolder = this.vaultFolder.getFolder('files');
    this.thumbsFolder = this.vaultFolder.getFolder('thumbs');
    this.indexFile = this.vaultFolder.getFile('index.json');
  }

  /** Loads the index. Safe to call repeatedly. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    let list: VaultEntry[] = [];
    try {
      const raw = this.indexFile.readTextSync();
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.entries)) list = data.entries as VaultEntry[];
    } catch (e) {
      list = [];
    }

    // Drop entries whose files no longer exist on disk.
    list = list.filter((e) => File.exists(this.filesFolder.getFile(e.id + (e.ext || '')).path));

    this.entries.set(list);
    this.persist();
  }

  private persist(): void {
    try {
      this.indexFile.writeTextSync(JSON.stringify({ version: 1, entries: this.entries() }));
    } catch (e) {
      // Best effort - the in-memory index stays authoritative for the session.
    }
  }

  filePathOf(entry: VaultEntry): string {
    return this.filesFolder.getFile(entry.id + (entry.ext || '')).path;
  }

  /**
   * Cross-screen handoff: the dashboard asks for the system picker
   * to be opened as soon as the vault screen is shown.
   */
  requestAutoAdd(): void {
    this.autoAddRequested = true;
  }

  consumeAutoAdd(): boolean {
    const v = this.autoAddRequested;
    this.autoAddRequested = false;
    return v;
  }

  thumbPathOf(entry: VaultEntry): string {
    const f = this.thumbsFolder.getFile(entry.id + '.jpg');
    return File.exists(f.path) ? f.path : '';
  }

  stats(): { count: number; bytes: number } {
    let bytes = 0;
    const list = this.entries();
    for (const e of list) bytes += e.size > 0 ? e.size : 0;
    return { count: list.length, bytes };
  }

  /**
   * Imports the picked content URIs into the vault:
   * copy -> verify -> generate thumbnail -> delete the original.
   */
  async importUris(
    uris: android.net.Uri[],
    onProgress: (p: ImportProgress) => void
  ): Promise<ImportResult> {
    const result: ImportResult = { imported: [], moved: 0, failed: [] };
    if (!isAndroid || !uris || uris.length === 0) return result;

    const metas: { uri: android.net.Uri; name: string; size: number }[] = [];
    let totalBytes = 0;
    for (const uri of uris) {
      const m = this.queryMeta(uri);
      metas.push({ uri, name: m.name, size: m.size });
      totalBytes += Math.max(0, m.size);
    }

    let doneBytes = 0;
    for (const m of metas) {
      try {
        const entry: VaultEntry = {
          id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          name: this.uniqueName(m.name),
          ext: extOf(m.name) ? '.' + extOf(m.name) : '',
          size: m.size,
          category: categoryOf(m.name),
          addedAt: Date.now(),
          moved: false,
        };
        const target = this.filesFolder.getFile(entry.id + entry.ext);

        await this.copyFromUri(m.uri, target.path, (bytes) => {
          doneBytes += bytes;
          onProgress({ done: doneBytes, total: Math.max(1, totalBytes), current: entry.name });
        });

        // Verification: the copy must match the size the provider reported.
        if (m.size > 0 && (!File.exists(target.path) || target.size !== m.size)) {
          try { target.remove(); } catch (e) { /* ignore */ }
          result.failed.push({ name: entry.name, reason: 'Copy verification failed' });
          continue;
        }

        if (entry.category === 'image') {
          try {
            this.makeThumb(target.path, this.thumbsFolder.getFile(entry.id + '.jpg').path);
          } catch (e) {
            // A missing thumbnail is cosmetic only.
          }
        }

        entry.moved = this.deleteOriginal(m.uri);
        if (entry.moved) result.moved++;

        this.entries.update((list) => [...list, entry]);
        result.imported.push(entry);
      } catch (e) {
        result.failed.push({
          name: m.name,
          reason: e && (e as any).message ? (e as any).message : 'Copy failed',
        });
      }
    }

    this.persist();
    return result;
  }

  /** Deletes entries from the vault permanently. */
  async deleteEntries(ids: string[]): Promise<void> {
    const gone = new Set(ids);
    for (const e of this.entries()) {
      if (!gone.has(e.id)) continue;
      try { this.filesFolder.getFile(e.id + (e.ext || '')).remove(); } catch (err) { /* ignore */ }
      try { this.thumbsFolder.getFile(e.id + '.jpg').remove(); } catch (err) { /* ignore */ }
    }
    this.entries.update((list) => list.filter((e) => !gone.has(e.id)));
    this.persist();
  }

  /** Copies a vault file back to Downloads/SecuVault (visible again). */
  async restoreToDownloads(entry: VaultEntry): Promise<boolean> {
    const src = this.filesFolder.getFile(entry.id + (entry.ext || ''));
    if (!File.exists(src.path)) return false;

    const sdk = android.os.Build.VERSION.SDK_INT;
    if (sdk >= 29) {
      try {
        const resolver = Utils.android.getApplicationContext().getContentResolver();
        const values = new android.content.ContentValues();
        values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, entry.name);
        values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeFor(entry));
        values.put(
          android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
          android.os.Environment.DIRECTORY_DOWNLOADS + '/SecuVault'
        );
        const outUri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (!outUri) return false;
        const out = resolver.openOutputStream(outUri);
        if (!out) return false;
        await this.copyStream(new java.io.FileInputStream(new java.io.File(src.path)), out, null);
        return true;
      } catch (e) {
        return false;
      }
    } else {
      try {
        const pub = android.os.Environment.getExternalStoragePublicDirectory(
          android.os.Environment.DIRECTORY_DOWNLOADS
        );
        const dir = new java.io.File(pub, 'SecuVault');
        dir.mkdirs();
        let dest = new java.io.File(dir, entry.name);
        if (dest.exists()) dest = new java.io.File(dir, this.uniqueName(entry.name));
        await this.copyStream(
          new java.io.FileInputStream(new java.io.File(src.path)),
          new java.io.FileOutputStream(dest),
          null
        );
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  /** Permanently deletes every vault file. */
  async eraseAll(): Promise<void> {
    try { this.filesFolder.clear(); } catch (e) { /* ignore */ }
    try { this.thumbsFolder.clear(); } catch (e) { /* ignore */ }
    this.entries.set([]);
    this.persist();
  }

  // ---------------------------------------------------------------- helpers

  private queryMeta(uri: android.net.Uri): { name: string; size: number } {
    let name = 'import_' + Date.now().toString(36);
    let size = -1;
    try {
      const resolver = Utils.android.getApplicationContext().getContentResolver();
      const cursor = resolver.query(uri, null, null, null, null);
      if (cursor) {
        try {
          if (cursor.moveToFirst()) {
            const nameIdx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
            const sizeIdx = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE);
            if (nameIdx >= 0) {
              const v = cursor.getString(nameIdx);
              if (v) name = v;
            }
            if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) size = cursor.getLong(sizeIdx);
          }
        } finally {
          cursor.close();
        }
      }
    } catch (e) {
      // Fall back to the generated name and unknown size.
    }
    return { name: sanitizeName(name), size };
  }

  /** Chunked copy that yields to the event loop so the UI stays alive. */
  private copyFromUri(uri: android.net.Uri, targetPath: string, onBytes: (n: number) => void): Promise<void> {
    const resolver = Utils.android.getApplicationContext().getContentResolver();
    const input = resolver.openInputStream(uri);
    if (!input) return Promise.reject(new Error('Cannot open the source file'));
    const output = new java.io.FileOutputStream(new java.io.File(targetPath));
    return this.copyStream(input, output, onBytes);
  }

  private copyStream(
    input: java.io.InputStream,
    output: java.io.OutputStream,
    onBytes: ((n: number) => void) | null
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const buf = Array.create('byte', 512 * 1024) as any;
      const step = () => {
        try {
          const n = input.read(buf);
          if (n > 0) {
            output.write(buf, 0, n);
            if (onBytes) onBytes(n);
            setTimeout(step, 0);
            return;
          }
          output.flush();
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      setTimeout(step, 0);
    }).then(
      () => { try { output.close(); input.close(); } catch (e) { /* ignore */ } },
      (e) => { try { output.close(); input.close(); } catch (err) { /* ignore */ } throw e; }
    );
  }

  private deleteOriginal(uri: android.net.Uri): boolean {
    try {
      const resolver = Utils.android.getApplicationContext().getContentResolver();
      android.provider.DocumentsContract.deleteDocument(resolver, uri);
      return true;
    } catch (e) {
      return false;
    }
  }

  private makeThumb(srcPath: string, outPath: string, maxDim: number = 320): void {
    const bounds = new android.graphics.BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    android.graphics.BitmapFactory.decodeFile(srcPath, bounds);
    const w = bounds.outWidth;
    const h = bounds.outHeight;
    if (!w || !h || w <= 0 || h <= 0) return;

    let sample = 1;
    while (Math.max(w, h) / sample > maxDim) sample *= 2;

    const opts = new android.graphics.BitmapFactory.Options();
    opts.inSampleSize = sample;
    const bmp = android.graphics.BitmapFactory.decodeFile(srcPath, opts);
    if (!bmp) return;
    try {
      const out = new java.io.FileOutputStream(new java.io.File(outPath));
      bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 82, out);
      out.close();
    } finally {
      try { bmp.recycle(); } catch (e) { /* ignore */ }
    }
  }

  private uniqueName(name: string): string {
    const existing = new Set(this.entries().map((e) => e.name.toLowerCase()));
    if (!existing.has(name.toLowerCase())) return name;
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.substring(0, dot) : name;
    const ext = dot > 0 ? name.substring(dot) : '';
    let i = 2;
    while (existing.has((base + ' (' + i + ')' + ext).toLowerCase())) i++;
    return base + ' (' + i + ')' + ext;
  }
}
