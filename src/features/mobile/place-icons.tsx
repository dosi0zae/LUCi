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

function HeritageIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M4 10 12 4l8 6" />
      <path d="M6 10v9" />
      <path d="M18 10v9" />
      <path d="M4 19h16" />
    </svg>
  );
}

function AttractionIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="m3 18 5-8 4 5 3-4 6 7" />
      <circle cx="7" cy="6" r="2" />
    </svg>
  );
}

function CultureFacilityIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <rect height="13" rx="1.8" width="16" x="4" y="5" />
      <circle cx="9" cy="10" r="1.3" />
      <path d="m6.5 16 3.4-3.7 2.4 2.5 2.1-2 3.1 3.2" />
    </svg>
  );
}

function FestivalIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M6 4v16" />
      <path d="M6 5h11l-2.5 3L17 11H6" />
    </svg>
  );
}

const categoryIcons: Record<PlaceCategory, (props: IconProps) => ReactElement> = {
  문화재: HeritageIcon,
  관광지: AttractionIcon,
  문화시설: CultureFacilityIcon,
  축제행사: FestivalIcon,
};

export function CategoryIcon({ category, className }: { category: PlaceCategory } & IconProps) {
  const Icon = categoryIcons[category];
  return <Icon className={className} />;
}
