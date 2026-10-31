/**
 * Stage 1 stylized route preview. Stage 2 replaces it with a real map of the
 * Routes API walking polyline (rendered via our server so no key reaches the client).
 */
export function RouteMap({ walkMinutes, name }: { walkMinutes: number; name: string }) {
  return (
    <div className="relative size-full overflow-hidden bg-[#e9e2d6] dark:bg-[#1f2124]">
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        role="img"
        aria-label={`Map preview: walking route to ${name}, about ${walkMinutes} minutes.`}
      >
        <g className="text-[#d8cfc0] dark:text-[#2c2f33]" fill="currentColor">
          <rect x="20" y="20" width="110" height="70" rx="6" />
          <rect x="150" y="20" width="90" height="70" rx="6" />
          <rect x="260" y="20" width="130" height="70" rx="6" />
          <rect x="20" y="110" width="110" height="80" rx="6" />
          <rect x="260" y="110" width="130" height="80" rx="6" />
          <rect x="20" y="210" width="220" height="80" rx="6" />
          <rect x="260" y="210" width="130" height="80" rx="6" />
        </g>
        {/* Park */}
        <rect x="150" y="110" width="90" height="80" rx="6" className="fill-[#b9d8c5] dark:fill-[#1d3b36]" />
        {/* Walking route */}
        <path
          d="M70 250 L70 200 L140 200 L140 100 L250 100 L250 55 L320 55"
          fill="none"
          stroke="#c8401f"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.25"
        />
        <path
          d="M70 250 L70 200 L140 200 L140 100 L250 100 L250 55 L320 55"
          fill="none"
          stroke="#c8401f"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 10"
          className="route-march"
        />
        {/* You */}
        <circle cx="70" cy="250" r="12" fill="#2563eb" opacity="0.2" />
        <circle cx="70" cy="250" r="6" fill="#2563eb" stroke="white" strokeWidth="2.5" />
        {/* Destination pin */}
        <g transform="translate(320 55)">
          <path d="M0 0c-9-11-14-17-14-24a14 14 0 0 1 28 0c0 7-5 13-14 24Z" fill="#c8401f" stroke="white" strokeWidth="2.5" />
          <circle cx="0" cy="-24" r="5" fill="white" />
        </g>
      </svg>
    </div>
  );
}
