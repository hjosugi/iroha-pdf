/**
 * Sending bytes to the platform print dialog (#23).
 *
 * The print plugin already does this for the open document: it hands the prepared
 * PDF to a hidden frame and calls `print()` on that frame. A layout is a different
 * document — produced in memory before it is saved — so it needs the same frame
 * without a plugin document behind it. Kept in one place so it can be reused by
 * anything else that produces printable bytes.
 *
 * The object URL is deliberately not revoked: revoking it while the print dialog
 * is still reading the frame is how a print comes out empty. The previous frame is
 * replaced on the next call, so at most one is kept.
 */
let printFrame: HTMLIFrameElement | null = null;

export function printPdfBytes(bytes: Uint8Array): void {
  printFrame?.remove();

  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (error) {
      // A webview that refuses the dialog is not a reason to take the app down;
      // the file is already saved next to it.
      console.warn('Iroha PDF: the print dialog could not be opened', error);
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
  printFrame = frame;
}
