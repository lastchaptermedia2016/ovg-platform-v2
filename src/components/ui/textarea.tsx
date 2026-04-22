import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  children?: React.ReactNode;
}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={`w-full px-3 py-2 rounded-lg border border-slate-700 bg-black/40 text-slate-200 focus:outline-none focus:border-gold-500 resize-none ${className || ""}`}
      {...props}
    />
  );
}
