/**
 * commandParser — parses raw user input from the CommandBar into a
 * structured Command object ready for routing.
 *
 * Supports an optional leading slash (e.g. "/signals" === "signals").
 * Input is lower-cased and tokenised on whitespace.
 *
 * Examples:
 *   "entity openai"           → { name: "entity", args: ["openai"] }
 *   "compare openai anthropic" → { name: "compare", args: ["openai", "anthropic"] }
 *   "/signals"                → { name: "signals", args: [] }
 */

export type Command = {
  /** Normalised command name (lower-case, no leading slash) */
  name: string;
  /** Positional arguments that follow the command name */
  args: string[];
};

/**
 * Supported command names — used for validation and autocomplete hints.
 */
export const SUPPORTED_COMMANDS = [
  'signals',
  'events',
  'entity',
  'timeline',
  'snapshot',
  'compare',
  'search',
  'top',
  'map',
  'explain',
  'help',
] as const;

export type CommandName = (typeof SUPPORTED_COMMANDS)[number];

/**
 * Parse a raw input string into a Command.
 *
 * Returns `{ name: '', args: [] }` for empty / whitespace-only input.
 */
export function parseCommand(input: string): Command {
  const cleaned = input.trim().toLowerCase();

  if (!cleaned) {
    return { name: '', args: [] };
  }

  // Strip optional leading slash
  const stripped = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;

  const tokens = stripped.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { name: '', args: [] };
  }

  return {
    name: tokens[0],
    args: tokens.slice(1),
  };
}

/**
 * Returns true when the command name is one of the recognised commands.
 */
export function isKnownCommand(name: string): name is CommandName {
  return (SUPPORTED_COMMANDS as readonly string[]).includes(name);
}
