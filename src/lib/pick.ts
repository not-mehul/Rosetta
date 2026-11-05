// The system file picker, as a promise.

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept,
      multiple,
    });
    input.style.display = 'none';
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

export async function fileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Whether this browser can pick a whole folder (desktop browsers; not phone WebViews). */
export const canPickFolder = typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input') && !/Android|iPhone|iPad/i.test(navigator.userAgent);

/** Every file in a folder the person picks, including its subfolders. */
export function pickFolder(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      multiple: true,
    });
    input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** A picked image cropped to the 2:3 of a book cover, as a 240px-wide JPEG. */
export async function coverFrom(file: Blob, width = 240): Promise<Uint8Array | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = 2 / 3;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (sw / sh > ratio) sw = Math.round(sh * ratio);
    else sh = Math.round(sw / ratio);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width / ratio);
    canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
