import { create } from "zustand";

const calcTotal = (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const useCartStore = create((set, get) => ({
  items: [],
  addToCart: (product) => {
    const items = [...get().items];
    const idx = items.findIndex((item) => item.id === product.id);

    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: items[idx].quantity + 1 };
    } else {
      items.push({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: 1,
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
        .map((item) =>
          item.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item
        )
        .filter((item) => item.quantity > 0),
    }),
  clearCart: () => set({ items: [] }),
  getTotal: () => calcTotal(get().items),
}));
