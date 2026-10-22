"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { ProductItem, ProductColorItem, ProductSizeItem } from "@/lib/catalog";

export interface CartItemData {
  id: string; // `${productId}-${colorSlug}-${sizeSlug}`
  product: ProductItem;
  color: ProductColorItem;
  size: ProductSizeItem;
  quantity: number;
}

interface CartContextType {
  items: CartItemData[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (product: ProductItem, color: ProductColorItem, size: ProductSizeItem, quantity?: number) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  totalCount: number;
  subtotal: number;
  freeShippingThreshold: number;
  amountNeededForFreeShipping: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "hm_cart_items_v1";
const DEFAULT_FREE_SHIPPING_THRESHOLD = 3500;

export function CartProvider({
  children,
  initialFreeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
}: {
  children: React.ReactNode;
  initialFreeShippingThreshold?: number;
}) {
  const [items, setItems] = useState<CartItemData[]>([]);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(initialFreeShippingThreshold);
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Yerel depolamadan yükle
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
    } catch {
      // localStorage erişim hatası olursa yok say
    }
    setIsInitialized(true);
  }, []);

  // Değişince yerel depolamaya kaydet
  useEffect(() => {
    if (isInitialized) {
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      } catch {
        // depolama doluysa yok say
      }
    }
  }, [items, isInitialized]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  const addItem = (
    product: ProductItem,
    color: ProductColorItem,
    size: ProductSizeItem,
    quantity = 1
  ) => {
    const itemId = `${product.id}-${color.slug}-${size.slug}`;

    setItems((prev) => {
      const existing = prev.find((i) => i.id === itemId);
      if (existing) {
        return prev.map((i) =>
          i.id === itemId ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { id: itemId, product, color, size, quantity }];
    });

    setIsOpen(true);
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => {
    const price = item.product.discountPrice || item.product.basePrice;
    return sum + price * item.quantity;
  }, 0);

  useEffect(() => {
    setFreeShippingThreshold(initialFreeShippingThreshold);
  }, [initialFreeShippingThreshold]);

  const amountNeededForFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        openCart,
        closeCart,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalCount,
        subtotal,
        freeShippingThreshold,
        amountNeededForFreeShipping,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart, CartProvider içinde kullanılmalıdır.");
  }
  return context;
}
