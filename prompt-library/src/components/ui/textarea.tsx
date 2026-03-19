import React from "react";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`border rounded px-2 py-1 text-sm w-full ${className}`}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";