import { Injectable } from '@angular/core';
import { AndroidApplication, Application, isAndroid } from '@nativescript/core';

interface ActivityResultArgs {
  requestCode: number;
  resultCode: number;
  intent?: android.content.Intent;
}

interface PendingPick {
  resolve: (uris: android.net.Uri[]) => void;
  reject: (e: any) => void;
}

/**
 * Native Android file picker built directly on the Storage Access
 * Framework (ACTION_OPEN_DOCUMENT). Lets the user pick any kind of
 * file - documents, images, videos, audio, archives - from internal
 * storage, SD card, cloud providers, etc.
 *
 * (The old @nativescript/filepicker plugin no longer exists, so this
 * service replaces it with ~80 lines of direct Android interop.)
 */
@Injectable({ providedIn: 'root' })
export class PickerService {
  private static nextRequestCode = 2300;
  private pending = new Map<number, PendingPick>();
  private active = false;

  constructor() {
    if (!isAndroid) return;
    Application.android.on(AndroidApplication.activityResultEvent, (raw: any) => {
      const args = raw as ActivityResultArgs;
      const pendingPick = this.pending.get(args.requestCode);
      if (!pendingPick) return;
      this.pending.delete(args.requestCode);
      this.active = false;

      if (args.resultCode === android.app.Activity.RESULT_OK && args.intent) {
        const uris: android.net.Uri[] = [];
        const clipData = args.intent.getClipData();
        if (clipData) {
          for (let i = 0; i < clipData.getItemCount(); i++) {
            const uri = clipData.getItemAt(i).getUri();
            if (uri) uris.push(uri);
          }
        } else {
          const uri = args.intent.getData();
          if (uri) uris.push(uri);
        }
        pendingPick.resolve(uris);
      } else {
        pendingPick.resolve([]);
      }
    });
  }

  /** True while an external activity (system picker) is in the foreground. */
  get isActive(): boolean {
    return this.active;
  }

  /**
   * Opens the system document picker (multi-select) and resolves with
   * the selected content URIs, or an empty array when cancelled.
   */
  pickFiles(mimeType: string = '*/*'): Promise<android.net.Uri[]> {
    if (!isAndroid) {
      return Promise.reject(new Error('File picking is only available on Android.'));
    }
    return new Promise((resolve, reject) => {
      try {
        const intent = new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(android.content.Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(
          android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION |
            android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );

        const activity = Application.android.foregroundActivity || Application.android.startActivity;
        if (!activity) {
          reject(new Error('No Android activity is available.'));
          return;
        }

        const requestCode = ++PickerService.nextRequestCode;
        this.pending.set(requestCode, { resolve, reject });
        this.active = true;
        activity.startActivityForResult(intent, requestCode);
      } catch (e) {
        this.active = false;
        reject(e);
      }
    });
  }
}
