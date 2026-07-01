import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "blue" | "neutral" | "green" | "amber";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const tones: Record<BadgeTone, string> = {
  blue: "bg-primary-soft text-primary-strong",
  neutral: "bg-surface-muted text-muted-strong",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-xs px-2.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
