"use client";

/** Name used for sign-offs and corrections. Sign-in is off for now, so this is the desk owner. */
export function useAuthor(fallback = "Ibad Zuberi"): string {
  return fallback;
}
