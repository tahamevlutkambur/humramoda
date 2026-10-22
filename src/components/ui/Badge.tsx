import React from "react";

export type BadgeVariant = "discount" | "status" | "campaign" | "outline" | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

export function Badge({
  children,
  variant = "neutral",
  style,
  ...props
}: BadgeProps) {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case "discount":
        return {
          backgroundColor: "var(--hm-color-text-main)",
          color: "var(--hm-color-text-light)",
        };
      case "campaign":
        return {
          backgroundColor: "var(--hm-color-discount)",
          color: "var(--hm-color-text-light)",
        };
      case "status":
        return {
          backgroundColor: "var(--hm-color-surface-subtle)",
          color: "var(--hm-color-text-main)",
          border: "1px solid var(--hm-color-border-main)",
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          color: "var(--hm-color-text-main)",
          border: "1px solid var(--hm-color-border-strong)",
        };
      case "neutral":
      default:
        return {
          backgroundColor: "var(--hm-color-surface)",
          color: "var(--hm-color-text-main)",
          border: "1px solid var(--hm-color-border-subtle)",
        };
    }
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.2rem 0.5rem",
        fontSize: "var(--hm-text-2xs)",
        fontWeight: "var(--hm-font-medium)",
        letterSpacing: "var(--hm-tracking-wide)",
        textTransform: "uppercase",
        borderRadius: "var(--hm-radius-xs)",
        lineHeight: 1.2,
        ...getVariantStyles(),
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
