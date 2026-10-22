"use client";

import React from "react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
      style={{
        padding: "0.5rem 1rem",
        fontSize: "var(--hm-text-xs)",
        fontWeight: 500,
        border: "1px solid var(--hm-color-border)",
        backgroundColor: "#FFFFFF",
        borderRadius: "4px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      🖨️ Sayfayı Yazdır
    </button>
  );
}
