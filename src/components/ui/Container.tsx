import React from "react";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: "max" | "editorial" | "narrow";
  className?: string;
}

export function Container({
  children,
  size = "max",
  className = "",
  style,
  ...props
}: ContainerProps) {
  const maxWidth =
    size === "narrow"
      ? "var(--hm-container-narrow)"
      : size === "editorial"
      ? "var(--hm-container-editorial)"
      : "var(--hm-container-max)";

  return (
    <div
      className={className}
      style={{
        width: "100%",
        maxWidth,
        marginLeft: "auto",
        marginRight: "auto",
        paddingLeft: "clamp(1rem, 4vw, 2.5rem)",
        paddingRight: "clamp(1rem, 4vw, 2.5rem)",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default Container;
