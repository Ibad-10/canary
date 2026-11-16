/** Name used for sign-offs and corrections. Sign-in is off for now, so this is the desk owner. */
export const DESK_OWNER = "Ibad Zuberi";

/** Outcome of a server write, so the UI can say honestly where it went. */
export type WriteResult = { ok: boolean; where: "supabase" | "local"; error?: string };
