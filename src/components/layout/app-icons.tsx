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

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function LocateIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function FilterIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="m4 11 8-7 8 7" />
      <path d="M6 10v10h12V10" />
    </svg>
  );
}

export function CompassIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 5-4 1 2-5z" />
    </svg>
  );
}

export function NavigationIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="m3 11 18-8-8 18-2-8z" />
    </svg>
  );
}

export function TrophyIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M5 6H3v2a4 4 0 0 0 4 4" />
      <path d="M19 6h2v2a4 4 0 0 1-4 4" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function BookmarkIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  );
}

export function HeartIcon({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} {...iconProps} fill={filled ? "currentColor" : "none"}>
      <path d="M19.5 12.572 12 20l-7.5-7.428a5 5 0 1 1 7.5-6.566 5 5 0 1 1 7.5 6.572z" />
    </svg>
  );
}

export function MapPinIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function ShareIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98" />
      <path d="m15.41 6.51-6.82 3.98" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function SparklesIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m6 6 2.5 2.5" />
      <path d="m15.5 15.5 2.5 2.5" />
      <path d="m18 6-2.5 2.5" />
      <path d="m8.5 15.5-2.5 2.5" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}

// The familiar "AI" sparkle: one large four-point star with two small ones. (SparklesIcon is
// a sunburst, which reads as "settings"/"asterisk", so it stays on the map's constellation toggle.)
export function AiSparklesIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6Z" />
      <path d="M16 6a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2Z" />
      <path d="M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2Z" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps} strokeWidth={2.4}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function ChevronUpIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      {/* A thumbtack seen from the side: flat head, narrow neck flaring into a wide
          base, and the needle underneath. */}
      <path d="M8.5 3h7" />
      <path d="M9.5 3v6.5L7 13.5h10L14.5 9.5V3" />
      <path d="M12 13.5V21" />
    </svg>
  );
}

export function MapPlusIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      {/* A folded map with a plus at its corner: "bring this course onto my map". */}
      <path d="M12.5 19.5 9 18l-6 3V8l6-3 6 3 6-3v8" />
      <path d="M9 5v13" />
      <path d="M15 8v8" />
      <path d="M16 19h6" />
      <path d="M19 16v6" />
    </svg>
  );
}

export function ImageIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <rect height="13" rx="1.8" width="16" x="4" y="5" />
      <circle cx="9" cy="10" r="1.3" />
      <path d="m6.5 16 3.4-3.7 2.4 2.5 2.1-2 3.1 3.2" />
    </svg>
  );
}

export function SlidersIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M4 6h8" />
      <path d="M16 6h4" />
      <circle cx="14" cy="6" r="2" />
      <path d="M4 12h2" />
      <path d="M10 12h10" />
      <circle cx="8" cy="12" r="2" />
      <path d="M4 18h10" />
      <path d="M18 18h2" />
      <circle cx="16" cy="18" r="2" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps} strokeWidth={2.4}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function RouteIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="5" r="2" />
      <path d="M11 19h5.5a3.5 3.5 0 0 0 0-7h-8a3.5 3.5 0 0 1 0-7H13" />
    </svg>
  );
}

export function RotateUpIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      {/* A circular arrow with its head at the top ("swap this one out"), drawn as a
          vertical mirror of the usual rotate icon so the arrow points upward. */}
      <g transform="matrix(1 0 0 -1 0 24)">
        <path d="M15 4.55a8 8 0 0 0-6 14.9m0-4.45v5H4" />
        <path d="M18.37 7.16v.01" />
        <path d="M13 19.94v.01" />
        <path d="M16.84 18.37v.01" />
        <path d="M19.37 15.1v.01" />
        <path d="M19.94 11v.01" />
      </g>
    </svg>
  );
}

export function PlaylistAddIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M19 8H5" />
      <path d="M5 12h9" />
      <path d="M11 16H5" />
      <path d="M15 16h6" />
      <path d="M18 13v6" />
    </svg>
  );
}

export function MapSearchIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      {/* A folded map with a magnifier at its corner: "look for other places here". */}
      <path d="M11 18 9 17l-6 3V7l6-3 6 3 6-3v7.5" />
      <path d="M9 4v13" />
      <path d="M15 7v5" />
      <circle cx="18" cy="18" r="3" />
      <path d="m20.2 20.2 1.8 1.8" />
    </svg>
  );
}

export function GripIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps} strokeWidth={2.6}>
      <circle cx="9" cy="6" r="0.5" fill="currentColor" />
      <circle cx="15" cy="6" r="0.5" fill="currentColor" />
      <circle cx="9" cy="12" r="0.5" fill="currentColor" />
      <circle cx="15" cy="12" r="0.5" fill="currentColor" />
      <circle cx="9" cy="18" r="0.5" fill="currentColor" />
      <circle cx="15" cy="18" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function MoreIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps} fill="currentColor" strokeWidth={0}>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

export function CommentIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M21 12c0 4.42-4.03 8-9 8-1.05 0-2.06-.16-3-.46L3 21l1.5-4.5C3.55 15.06 3 13.58 3 12c0-4.42 4.03-8 9-8s9 3.58 9 8Z" />
    </svg>
  );
}

export function TalkBubbleIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps} fill="currentColor" stroke="none">
      <path d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.66 1.77 5 4.43 6.33-.2.72-.72 2.6-.83 3-.13.5.18.5.38.36.16-.11 2.55-1.73 3.59-2.44.62.09 1.27.14 1.93.14 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5Z" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <svg className={className} {...iconProps} strokeWidth={1}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9z" />
    </svg>
  );
}
