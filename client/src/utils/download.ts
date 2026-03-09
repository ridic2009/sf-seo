export function triggerFileDownload(downloadPath: string) {
  const anchor = document.createElement('a');
  anchor.href = downloadPath;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}