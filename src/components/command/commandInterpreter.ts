/**
 * Omterminal — Command Interpreter
 *
 * Deterministic parser for command-style queries in the command palette.
 * Supports commands like /entity openai, /trend robotics, /compare openai,anthropic
 */

export interface CommandResult {
  /** Whether the input was recognized as a command */
  isCommand: boolean;
  /** The parsed command type */
  command?: string;
  /** The argument string after the command */
  args?: string;
  /** Direct navigation href if the command resolves to a single destination */
  href?: string;
  /** Search query to pass to the API if the command needs search results */
  searchQuery?: string;
  /** Suggestion text when the command is incomplete */
  suggestion?: string;
}

const COMMANDS: Record<string, {
  description: string;
  requiresArgs: boolean;
  resolve: (args: string) => Partial<CommandResult>;
}> = {
  entity: {
    description: 'Go to an entity dossier',
    requiresArgs: true,
    resolve: (args) => {
      if (!args) return { suggestion: 'Type an entity name, e.g. /entity OpenAI' };
      const slug = args.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return { href: `/entity/${slug}`, searchQuery: args };
    },
  },
  trend: {
    description: 'Go to a trend page',
    requiresArgs: true,
    resolve: (args) => {
      if (!args) return { suggestion: 'Type a trend topic, e.g. /trend robotics' };
      const slug = args.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return { href: `/trend/${slug}`, searchQuery: args };
    },
  },
  signal: {
    description: 'Search signals',
    requiresArgs: true,
    resolve: (args) => {
      if (!args) return { suggestion: 'Type a signal keyword, e.g. /signal hiring' };
      return { searchQuery: args };
    },
  },
  compare: {
    description: 'Compare two entities',
    requiresArgs: true,
    resolve: (args) => {
      if (!args) return { suggestion: 'Enter two entities separated by a comma, e.g. /compare openai,anthropic' };
      const parts = args.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) return { suggestion: 'Enter two entities separated by a comma, e.g. /compare openai,anthropic', searchQuery: parts[0] };
      const slugA = parts[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const slugB = parts[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return { href: `/compare?entities=${slugA},${slugB}` };
    },
  },
  watchlist: {
    description: 'Open your watchlist',
    requiresArgs: false,
    resolve: () => ({ href: '/watchlist' }),
  },
  alerts: {
    description: 'View intelligence alerts',
    requiresArgs: false,
    resolve: () => ({ href: '/dashboard' }),
  },
  feed: {
    description: 'Open the intelligence feed',
    requiresArgs: false,
    resolve: () => ({ href: '/intelligence' }),
  },
  events: {
    description: 'Browse events timeline',
    requiresArgs: false,
    resolve: () => ({ href: '/events' }),
  },
  trends: {
    description: 'View emerging trends',
    requiresArgs: false,
    resolve: () => ({ href: '/trend' }),
  },
};

/**
 * Parse a command-style input string.
 * Returns isCommand: false if the input doesn't start with /
 */
export function interpretCommand(input: string): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { isCommand: false };
  }

  const withoutSlash = trimmed.slice(1);
  const spaceIdx = withoutSlash.indexOf(' ');
  const cmdName = (spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : withoutSlash.slice(spaceIdx + 1).trim();

  const cmd = COMMANDS[cmdName];
  if (!cmd) {
    // Try prefix matching for partial commands
    const matches = Object.keys(COMMANDS).filter((k) => k.startsWith(cmdName));
    if (matches.length === 1) {
      const matched = COMMANDS[matches[0]];
      const resolved = matched.resolve(args);
      return { isCommand: true, command: matches[0], args, ...resolved };
    }
    if (matches.length > 1) {
      return {
        isCommand: true,
        command: cmdName,
        suggestion: `Did you mean: ${matches.map((m) => `/${m}`).join(', ')}?`,
      };
    }
    return {
      isCommand: true,
      command: cmdName,
      suggestion: `Unknown command /${cmdName}. Try /entity, /trend, /signal, /compare, /watchlist, /alerts`,
    };
  }

  const resolved = cmd.resolve(args);
  return { isCommand: true, command: cmdName, args, ...resolved };
}

/**
 * Get available command suggestions for display in the palette.
 */
export function getCommandSuggestions(): Array<{ command: string; description: string }> {
  return Object.entries(COMMANDS).map(([command, { description }]) => ({
    command: `/${command}`,
    description,
  }));
}
