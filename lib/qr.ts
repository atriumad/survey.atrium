import QRCode from "qrcode";

export function buildReviewUrl(baseUrl: string, locationSlug: string): string {
  return `${baseUrl.replace(/\/$/, "")}/r/${locationSlug}`;
}

export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 512, margin: 2 });
}