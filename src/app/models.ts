export type Category = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export interface VaultEntry {
  /** Unique id of the vault entry. */
  id: string;
  /** Original file name as it appeared on the device. */
  name: string;
  /** Lower-case extension including the dot, e.g. ".pdf" ("" when none). */
  ext: string;
  /** Size in bytes (-1 when unknown). */
  size: number;
  category: Category;
  /** Epoch ms when the file was imported. */
  addedAt: number;
  /** True when the original file was deleted from the phone (moved). */
  moved: boolean;
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tif', 'tiff', 'avif'];
const VIDEO_EXT = ['mp4', 'mkv', 'mov', 'avi', 'webm', '3gp', 'm4v', 'flv', 'wmv', 'ts', 'mpg', 'mpeg'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'amr', 'mid', 'midi'];
const DOC_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt', 'ods', 'odp', 'epub', 'log'];
const ARCHIVE_EXT = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'apk'];

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i <= 0 || i === name.length - 1) return '';
  return name.substring(i + 1).toLowerCase();
}

export function categoryOf(name: string): Category {
  const e = extOf(name);
  if (IMAGE_EXT.indexOf(e) >= 0) return 'image';
  if (VIDEO_EXT.indexOf(e) >= 0) return 'video';
  if (AUDIO_EXT.indexOf(e) >= 0) return 'audio';
  if (DOC_EXT.indexOf(e) >= 0) return 'document';
  if (ARCHIVE_EXT.indexOf(e) >= 0) return 'archive';
  return 'other';
}

export function mimeFor(entry: VaultEntry): string {
  const ext = entry.ext ? entry.ext.substring(1) : '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    bmp: 'image/bmp', svg: 'image/svg+xml', heic: 'image/heic',
    mp4: 'video/mp4', mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo',
    webm: 'video/webm', '3gp': 'video/3gpp', m4v: 'video/x-m4v',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
    flac: 'audio/flac', opus: 'audio/opus',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar', gz: 'application/gzip', apk: 'application/vnd.android.package-archive',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * NOTE: human-readable formatting (byte sizes, dates, category
 * labels) lives in I18nService so it follows the app language.
 */

/** Removes characters that are unsafe in file names (path separators, control chars). */
export function sanitizeName(name: string): string {
  let out = (name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  if (!out) out = 'import_' + Date.now().toString(36);
  if (out.length > 120) {
    const dot = out.lastIndexOf('.');
    if (dot > 80) out = out.substring(0, 80) + out.substring(dot);
    else out = out.substring(0, 120);
  }
  return out;
}
