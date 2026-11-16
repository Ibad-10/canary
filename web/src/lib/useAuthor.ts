"use client";
import { DESK_OWNER } from "./author";

/** Name used for sign-offs and corrections. Sign-in is off for now, so this is the desk owner. */
export function useAuthor(fallback = DESK_OWNER): string {
  return fallback;
}
