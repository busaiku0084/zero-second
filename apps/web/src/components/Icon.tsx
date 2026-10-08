import type { IconName } from "@/lib/labels";

const PATHS: Record<IconName, string> = {
  clock: "M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z",
  spinner: "M8 2a6 6 0 1 0 6 6",
  check: "M3.5 8.5 6.5 11.5 12.5 4.5",
  cross: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  hand: "M8 4v5M8 11.5v.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z",
  slash: "M3.8 12.2 12.2 3.8M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z",
  sold: "M2.5 8h11M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z",
};

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
