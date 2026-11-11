/**
 * One sentence for what Zesthunt keeps, used everywhere it comes up. True because: picks,
 * likes, maybes and skips live in memory on the device (gone on reload, close or after 10
 * quiet minutes); "What I eat" and remembered places go to this browser's storage only when
 * the person opts in; the server keeps no requests (only a few minutes of restaurant data
 * per ~1 km area, and party rooms, below).
 */
export const KEPT_HERE = "Kept on this device only, never on our servers.";

/** The one exception: a party room (nicknames, places, answers) lives on our server until it closes. */
export const PARTY_KEPT = "Party answers are deleted from our server after 45 minutes.";
