export function punchQrPayload(token: string): string {
  return `gennesis-punch:${String(token || '').trim()}`;
}

export function newPunchQrToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function punchQrDataUrl(token: string): Promise<string> {
  const payload = punchQrPayload(token);
  if (!payload.replace(/^gennesis-punch:/i, '').trim()) {
    throw new Error('Token do QR inválido');
  }
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(payload, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827', light: '#ffffff' },
  });
}

export function printPunchLocationQr(opts: {
  name: string;
  payload: string;
  dataUrl: string;
}) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=520,height=720');
  if (!w) {
    throw new Error('Permita pop-ups para imprimir o QR.');
  }
  const title = opts.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const payload = opts.payload.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  w.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>QR — ${title}</title>
  <style>
    @page { margin: 16mm; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      width: 100%;
      max-width: 420px;
      text-align: center;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 28px 24px;
    }
    h1 { margin: 0 0 8px; font-size: 20px; font-weight: 700; }
    p { margin: 0; color: #6b7280; font-size: 13px; line-height: 1.45; }
    img { display: block; width: 260px; height: 260px; margin: 20px auto 14px; }
    code {
      display: block;
      word-break: break-all;
      font-size: 11px;
      color: #4b5563;
      background: #f9fafb;
      border-radius: 8px;
      padding: 10px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>QR Code da localidade para registro de ponto</p>
    <img src="${opts.dataUrl}" alt="QR Code ${title}" />
    <code>${payload}</code>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.focus(); window.print(); }, 250);
    };
  </script>
</body>
</html>`);
  w.document.close();
}
