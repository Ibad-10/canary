"use client";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Aceternity-style Spotlight: a soft cone of light that sweeps in once. Decorative only. */
export function Spotlight({ className, fill = "#FFD60A" }: { className?: string; fill?: string }) {
  return (
    <motion.svg
      aria-hidden="true"
      className={cn("pointer-events-none absolute z-0 h-[169%] w-[138%] lg:w-[84%]", className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 3787 2842"
      fill="none"
      initial={{ opacity: 0, x: -80, y: -20 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 1.6, ease: "easeOut" }}
    >
      <g filter="url(#spot-blur)">
        <ellipse cx="1924.71" cy="273.501" rx="1924.71" ry="273.501" transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)" fill={fill} fillOpacity="0.22" />
      </g>
      <defs>
        <filter id="spot-blur" x="0.860352" y="0.838989" width="3785.16" height="2840.26" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </motion.svg>
  );
}
