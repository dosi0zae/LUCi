import { CategoryIcon } from "@/features/mobile/place-icons";
import { categoryTone, type PlaceCategory } from "@/features/mobile/mobile-data";
import { cn } from "@/lib/utils";

type PlaceThumbProps = {
  category: PlaceCategory;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizes = {
  sm: { box: "h-10 w-10 rounded-sm", icon: "h-4 w-4" },
  md: { box: "h-12 w-12 rounded-md", icon: "h-5 w-5" },
  lg: { box: "h-16 w-16 rounded-lg", icon: "h-6 w-6" },
};

export function PlaceThumb({ category, className, size = "md" }: PlaceThumbProps) {
  const tone = categoryTone[category];

  return (
    <span
      className={cn("grid shrink-0 place-items-center", sizes[size].box, className)}
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 32%, transparent), color-mix(in srgb, ${tone} 12%, transparent))`,
        color: tone,
      }}
    >
      <CategoryIcon category={category} className={sizes[size].icon} />
    </span>
  );
}
