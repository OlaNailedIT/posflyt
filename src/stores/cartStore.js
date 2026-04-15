import { create } from "zustand";
import { roundCurrency } from "../utils/currency";

function lineUnitPrice(product) {
  if (!product) return 0;
  const ut = product.unitType || "unit";
  if (ut !== "unit") {
    return Number(product.pricePerUnit ?? product.price ?? 0);
  }
  return Number(product.price ?? product.sellingPrice ?? 0);
}

const calcTotal = (items) =>
  items.reduce((sum, item) => sum + roundCurrency(item.unitPrice * item.quantity), 0);

export const useCartStore = create((set, get) => ({
  items: [],
  /** Ephemeral guard: one synchronous checkout per cart; blocks rapid re-entry (not button-only). */
  checkoutLock: false,
  beginCheckout: () => {
    if (get().checkoutLock) return false;
    set({ checkoutLock: true });
    return true;
  },
  endCheckout: () => set({ checkoutLock: false }),
  /**
   * @param product - from API (includes unitType, pricePerUnit when set)
   * @param [opts.quantity] - for measured products; defaults to 1 (kg/litre)
   */
  addToCart: (product, opts = {}) => {
    const items = [...get().items];
    const ut = product.unitType || "unit";
    const isMeasured = ut !== "unit";
    const unitPrice = lineUnitPrice(product);
    const defaultQty = isMeasured ? (opts.quantity != null ? Number(opts.quantity) : 1) : 1;
    const qty = isMeasured
      ? Math.max(0.0001, roundCurrency(Number(opts.quantity != null ? opts.quantity : defaultQty)))
      : Math.max(1, Math.round(Number(opts.quantity != null ? opts.quantity : 1)));

    const idx = items.findIndex((item) => item.id === product.id);

    if (idx >= 0) {
      const nextQty = isMeasured
        ? roundCurrency(items[idx].quantity + qty)
        : items[idx].quantity + qty;
      items[idx] = {
        ...items[idx],
        quantity: isMeasured ? Math.max(0.0001, nextQty) : nextQty,
        unitPrice,
        unitType: ut,
      };
    } else {
      items.push({
        id: product.id,
        name: product.name,
        unitPrice,
        quantity: qty,
        unitType: ut,
      });
    }
    set({ items });
  },
  removeFromCart: (productId) =>
    set({
      items: get().items.filter((item) => item.id !== productId),
    }),
  setQuantity: (productId, quantity) =>
    set({
      items: get().items
        .map((item) => {
          if (item.id !== productId) return item;
          const isMeasured = (item.unitType || "unit") !== "unit";
          const q = Number(quantity);
          if (!Number.isFinite(q)) return item;
          if (isMeasured) {
            const next = Math.max(0.0001, roundCurrency(q));
            return { ...item, quantity: next };
          }
          const whole = Math.max(1, Math.round(q));
          return { ...item, quantity: whole };
        })
        .filter((item) => item.quantity > 0),
    }),
  clearCart: () => set({ items: [] }),
  getTotal: () => calcTotal(get().items),
}));
