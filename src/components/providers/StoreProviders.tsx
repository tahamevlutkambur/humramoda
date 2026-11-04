"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CartProvider } from "@/context/CartContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { CustomerAuthProvider } from "@/context/CustomerAuthContext";
import { CartDrawer } from "@/components/cart/CartDrawer";

function SiteActivityTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    let sessionId = sessionStorage.getItem("hm-visitor-session");
    if (!sessionId) {
      sessionId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("hm-visitor-session", sessionId);
    }
    void fetch("/api/site/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "PAGE_VIEW", path: pathname, sessionId }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}

export function StoreProviders({
  children,
  freeShippingThreshold = 3500,
}: {
  children: React.ReactNode;
  freeShippingThreshold?: number;
}) {
  return (
    <CustomerAuthProvider>
      <FavoritesProvider>
        <CartProvider initialFreeShippingThreshold={freeShippingThreshold}>
          <SiteActivityTracker />
          {children}
          <CartDrawer />
        </CartProvider>
      </FavoritesProvider>
    </CustomerAuthProvider>
  );
}

export default StoreProviders;
