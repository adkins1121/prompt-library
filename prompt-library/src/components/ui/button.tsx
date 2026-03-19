import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "destructive" | "ghost";
};

export const Button: React.FC<Props> = ({ variant = "default", className = "", ...rest }) => {
  return (
    <button
      className={`px-3 py-2 rounded ${variant === "secondary" ? "bg-gray-200" : "bg-gray-900 text-white"} ${className}`}
      {...rest}
    />
  );
};