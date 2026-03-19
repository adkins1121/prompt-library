import React from "react";

export const Badge: React.FC<{ children: React.ReactNode; variant?: "default" | "secondary" | "outline"; }> = ({
  children,
  variant = "default",
}) => {
  let style = "bg-gray-900 text-white";
  if (variant === "secondary") style = "bg-gray-200 text-gray-800";
  if (variant === "outline") style = "border border-gray-400 text-gray-800";
  return <span className={`px-2 py-1 text-xs rounded-full ${style}`}>{children}</span>;
};