declare global {
  interface Window {
    __erpMobileWebView?: boolean;
    ErpMobileOpenUrl?: { postMessage: (url: string) => void };
  }
}

/** App Flutter (WebView) injeta esta flag e o canal ErpMobileOpenUrl. */
export function isErpMobileWebView(): boolean {
  return typeof window !== 'undefined' && window.__erpMobileWebView === true;
}

/** Abre URL no visualizador externo do sistema (Android/iOS). */
export function openUrlInErpMobile(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || typeof window.ErpMobileOpenUrl?.postMessage !== 'function') {
    return false;
  }
  window.ErpMobileOpenUrl.postMessage(trimmed);
  return true;
}
