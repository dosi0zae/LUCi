import type { ReactElement } from "react";
import type { PlaceCategory } from "@/features/mobile/mobile-data";

type IconProps = {
  className?: string;
};

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
  viewBox: "0 0 24 24",
} as const;

function ExhibitIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <rect height="13" rx="1.8" width="16" x="4" y="5" />
      <circle cx="9" cy="10" r="1.3" />
      <path d="m6.5 16 3.4-3.7 2.4 2.5 2.1-2 3.1 3.2" />
    </svg>
  );
}

function CafeIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M6 9h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z" />
      <path d="M16 10h1.4a2.1 2.1 0 0 1 0 4.2H16" />
      <path d="M5 20h13" />
    </svg>
  );
}

function PopupIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M6.5 9h11l-.8 10H7.3z" />
      <path d="M9 9a3 3 0 0 1 6 0" />
      <path d="m18.5 4 .5 1.6 1.5.5-1.5.5-.5 1.6-.5-1.6-1.5-.5 1.5-.5z" />
    </svg>
  );
}

function WalkIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M12 20v-6" />
      <path d="M8.2 14.5a4.2 4.2 0 1 1 7.6 0" />
      <path d="M9 20h6" />
      <path d="M10 16.5 12 14l2 2.5" />
    </svg>
  );
}

const categoryIcons: Record<PlaceCategory, (props: IconProps) => ReactElement> = {
  전시: ExhibitIcon,
  카페: CafeIcon,
  팝업: PopupIcon,
  산책: WalkIcon,
};

export function CategoryIcon({ category, className }: { category: PlaceCategory } & IconProps) {
  const Icon = categoryIcons[category];
  return <Icon className={className} />;
}
