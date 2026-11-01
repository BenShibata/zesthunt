import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 24, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...rest,
  };
}

/** Brand mark: a compass. */
export function CompassMark(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15.8 8.2 13.4 13.4 8.2 15.8 10.6 10.6Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RewindIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function SkipIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function GoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

export function WalkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="13" cy="4.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="m9 21 2.5-6.5L14 17v4M7.5 11.5l2.5-3.5 3.5-1 2 3.5 2.5 1.5M11.5 14.5l1-5" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function CardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function TapIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8.5 8.5a5 5 0 0 1 7 0M6 6a8.5 8.5 0 0 1 12 0" />
      <rect x="8" y="12" width="8" height="9" rx="1.5" />
    </svg>
  );
}

export function CashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function BagIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 8h14l-1 12H6Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

export function PartyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M16 13.6a4.5 4.5 0 0 1 5 4.4" />
    </svg>
  );
}

export function DiceIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 6 9 12l6 6" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z" />
      <path d="M5 19 13 11" />
    </svg>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12V4h8l10 10-8 8Z" />
      <circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2.5M19 16v2.5M4 11h16" />
      <circle cx="8" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
