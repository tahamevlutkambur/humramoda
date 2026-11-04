"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface CustomerAddress {
  id: string;
  customerId: string;
  title: string;
  recipient: string;
  phone: string;
  city: string;
  district: string;
  neighborhood?: string;
  fullAddress: string;
  postalCode?: string;
  isDefaultDelivery?: boolean;
  isDefaultBilling?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  marketingConsent?: boolean;
  addresses?: CustomerAddress[];
  createdAt?: string;
}

interface CustomerAuthContextType {
  customer: CustomerProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; waitSeconds?: number }>;
  register: (data: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    passwordRepeat: string;
    kvkkApproved: boolean;
    termsApproved: boolean;
    marketingConsent?: boolean;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCustomer = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCustomer(data.user || null);
      } else {
        setCustomer(null);
      }
    } catch {
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCustomer();
  }, [refreshCustomer]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || "Giriş başarısız oldu.",
          waitSeconds: data.waitSeconds,
        };
      }

      await refreshCustomer();
      return { success: true };
    } catch {
      return { success: false, error: "Sunucu bağlantı hatası oluştu." };
    }
  };

  const register = async (inputData: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    passwordRepeat: string;
    kvkkApproved: boolean;
    termsApproved: boolean;
    marketingConsent?: boolean;
  }) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          error: data.error || "Kayıt işlemi başarısız oldu.",
        };
      }

      await refreshCustomer();
      return { success: true };
    } catch {
      return { success: false, error: "Sunucu bağlantı hatası oluştu." };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Çıkış hatasını göz ardı et
    } finally {
      setCustomer(null);
    }
  };

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        loading,
        login,
        register,
        logout,
        refreshCustomer,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextType {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return context;
}

