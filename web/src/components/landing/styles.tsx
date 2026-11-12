const names = ["grid", "blobA", "blobB", "marquee", "track", "spot", "pulse", "dash", "range"] as const;
export const s = Object.fromEntries(names.map((n) => [n, `lp-${n}`])) as Record<(typeof names)[number], string>;

const css = `
.lp-grid {
  background-image: linear-gradient(to right, rgba(30,29,26,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,29,26,.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 40%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, #000 40%, transparent 100%);
}
.lp-blobA { animation: lp-driftA 18s ease-in-out infinite alternate; will-change: transform; }
.lp-blobB { animation: lp-driftB 22s ease-in-out infinite alternate; will-change: transform; }
@keyframes lp-driftA { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(80px,40px,0) scale(1.15); } }
@keyframes lp-driftB { from { transform: translate3d(0,0,0) scale(1.1); } to { transform: translate3d(-90px,-30px,0) scale(.95); } }
.lp-marquee { mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent); }
.lp-track { display: flex; width: max-content; animation: lp-scroll 36s linear infinite; }
.lp-marquee:hover .lp-track { animation-play-state: paused; }
@keyframes lp-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.lp-spot { position: relative; isolation: isolate; }
.lp-spot::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  background: radial-gradient(260px circle at var(--mx,50%) var(--my,50%), rgba(229,191,0,1), rgba(255,214,10,0) 70%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 2;
}
.lp-spot::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: radial-gradient(360px circle at var(--mx,50%) var(--my,50%), rgba(255,214,10,.12), transparent 60%);
  opacity: 0; transition: opacity .25s; pointer-events: none; z-index: -1;
}
.lp-spot:hover::before, .lp-spot:hover::after { opacity: 1; }
.lp-pulse { animation: lp-pulse 2s ease-out infinite; }
@keyframes lp-pulse { 0% { box-shadow: 0 0 0 0 rgba(217,45,32,.45); } 100% { box-shadow: 0 0 0 8px rgba(217,45,32,0); } }
.lp-dash { stroke-dasharray: 4 6; animation: lp-dash 1.2s linear infinite; }
@keyframes lp-dash { to { stroke-dashoffset: -20; } }
.lp-range { accent-color: #1e1d1a; }
@media (prefers-reduced-motion: reduce) { .lp-blobA, .lp-blobB, .lp-track, .lp-pulse, .lp-dash { animation: none; } }
`;

export function LandingStyles() {
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
