import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-sm border border-border bg-surface p-5 shadow-soft",
        className,
      )}
      {...props}
    />
  );
}
