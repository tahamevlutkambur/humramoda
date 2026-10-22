import React from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "text";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: "var(--hm-color-text-main)",
          color: "var(--hm-color-text-light)",
          border: "1px solid var(--hm-color-text-main)",
        };
      case "secondary":
        return {
          backgroundColor: "var(--hm-color-surface-subtle)",
          color: "var(--hm-color-text-main)",
          border: "1px solid var(--hm-color-border-main)",
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          color: "var(--hm-color-text-main)",
          border: "1px solid var(--hm-color-text-main)",
        };
      case "text":
        return {
          backgroundColor: "transparent",
          color: "var(--hm-color-text-main)",
          border: "none",
          paddingLeft: 0,
          paddingRight: 0,
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case "sm":
        return {
          padding: "0.5rem 1rem",
          fontSize: "var(--hm-text-xs)",
          letterSpacing: "var(--hm-tracking-wider)",
        };
      case "md":
        return {
          padding: "0.875rem 1.75rem",
          fontSize: "var(--hm-text-xs)",
          letterSpacing: "var(--hm-tracking-widest)",
        };
      case "lg":
        return {
          padding: "1.125rem 2.25rem",
          fontSize: "var(--hm-text-sm)",
          letterSpacing: "var(--hm-tracking-widest)",
        };
    }
  };

  return (
    <button
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        width: fullWidth ? "100%" : "auto",
        textTransform: "uppercase",
        fontWeight: "var(--hm-font-medium)",
        borderRadius: "var(--hm-radius-xs)",
        transition: "all var(--hm-transition-fast)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
