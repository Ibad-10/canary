export default function Logo({ size = 24, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="7" fill="#FFD60A" />
        <path d="M6.5 14.2c0-3.6 2.6-6.4 6-6.4 1.9 0 3.3 1 4 2.4l2.1-.3-1.7 1.7c.1 3.3-2.4 6.1-6.1 6.1H7l1.7-1.5c-1.3-.4-2.2-1.1-2.2-2z" fill="#1E1D1A" />
        <circle cx="14.4" cy="10.9" r=".9" fill="#FFD60A" />
      </svg>
      {word && <span className="font-semibold text-[15px]">Canary</span>}
    </span>
  );
}
