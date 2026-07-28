/* ===========================================================
   京の家計帖 — プレミアム機能（Google Play Billing 連携）
   Trusted Web Activity 経由でGoogle Playからインストールした場合のみ、
   Digital Goods API で購入・保有確認ができます。
   （通常のブラウザ／GitHub Pages等では購入不可。window.Premium.purchase() は
   その旨をトーストで案内し、既存の無料機能には一切影響しません。）
   =========================================================== */
(() => {
  "use strict";

  const SKU = "premium_unlock"; // Google Play Console の管理対象アプリ内商品IDと合わせる
  const ENTITLEMENT_KEY = "kyo-kakeicho:premium";

  let cachedService = null;
  let serviceChecked = false;

  async function getService() {
    if (serviceChecked) return cachedService;
    serviceChecked = true;
    if (!("getDigitalGoodsService" in window)) return null;
    try {
      cachedService = await window.getDigitalGoodsService("https://play.google.com/billing");
    } catch (e) {
      cachedService = null;
    }
    return cachedService;
  }

  function isUnlocked() {
    return localStorage.getItem(ENTITLEMENT_KEY) === "1";
  }

  function setUnlocked(value) {
    if (value) localStorage.setItem(ENTITLEMENT_KEY, "1");
    else localStorage.removeItem(ENTITLEMENT_KEY);
  }

  // Play上の実際の購入状態と同期する（起動時に呼ぶ）
  async function refresh() {
    const service = await getService();
    if (!service) return isUnlocked();
    try {
      const purchases = await service.listPurchases();
      const owned = purchases.some((p) => p.itemId === SKU);
      setUnlocked(owned);
      return owned;
    } catch (e) {
      return isUnlocked();
    }
  }

  async function purchase() {
    const service = await getService();
    if (!service || typeof PaymentRequest === "undefined") {
      return { ok: false, reason: "unsupported" };
    }
    try {
      const request = new PaymentRequest(
        [{ supportedMethods: "https://play.google.com/billing", data: { sku: SKU } }],
        { total: { label: "プレミアム機能", amount: { currency: "JPY", value: "0" } } }
      );
      const response = await request.show();
      const { purchaseToken } = response.details;
      await service.acknowledge(purchaseToken, "onetime");
      await response.complete("success");
      setUnlocked(true);
      return { ok: true };
    } catch (e) {
      const cancelled = e && (e.name === "AbortError" || e.name === "NotSupportedError");
      return { ok: false, reason: cancelled ? "cancelled" : "error" };
    }
  }

  window.Premium = { isUnlocked, refresh, purchase };
})();
