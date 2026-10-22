"use client";

import React from "react";
import { CartProvider } from "@/context/CartContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { CartDrawer } from "@/components/cart/CartDrawer";

export function StoreProviders({
  children,
  freeShippingThreshold = 3500,
}: {
  children: React.ReactNode;
  freeShippingThreshold?: number;
}) {
  return (
    <FavoritesProvider>
      <CartProvider initialFreeShippingThreshold={freeShippingThreshold}>
        {children}
        <CartDrawer />
      </CartProvider>
    </FavoritesProvider>
  );
}

export default StoreProviders;
