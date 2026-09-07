export async function download(blob, filename) {
  const native = window.DisposableCameraDownloads;
  if (native) {
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Could not prepare the download.')); reader.readAsDataURL(blob);
    });
    await new Promise((resolve, reject) => {
      native.onmessage = event => {
        if (event.data === 'save-dialog-opened') return;
        native.onmessage = null;
        if (event.data === 'saved') resolve();
        else reject(new Error(event.data === 'cancelled' ? 'Save cancelled.' : 'Could not save the file. Try again.'));
      };
      native.postMessage(JSON.stringify({ fileName: filename, mimeType: blob.type, dataBase64: base64 }));
    });
    return;
  }
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
