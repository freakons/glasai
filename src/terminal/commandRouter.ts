/**
 * commandRouter — routes a parsed Command to the appropriate handler and
 * returns a structured result for display in the CommandBar output panel.
 *
 * All handlers return mock data for now; they are designed to be replaced
 * by real API calls without changing the return shape.
 */

import type { Command } from './commandParser';
import MOCK_SIGNALS, { getSignalById } from '../data/mockSignals';
import MOCK_EVENTS, { getRecentEvents } from '../data/mockEvents';
import MOCK_ENTITIES, { resolveEntity, getTopEntities } from '../data/mockEntities';

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export type CommandResult =
  | { type: 'lines'; lines: ResultLine[] }
  | { type: 'error'; message: string };

/**
 * A single output line. Optional `style` enables terminal-style colouring
 * (interpreted by the display layer).
 */
export type ResultLine = {
  text: string;
  style?: 'header' | 'key' | 'value' | 'dim' | 'accent' | 'divider' | 'warning';
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function line(text: string, style?: ResultLine['style']): ResultLine {
  return { text, style };
}

function divider(): ResultLine {
  return { text: '─'.repeat(48), style: 'divider' };
}

function formatDate(iso: string): string {
  if (!iso || iso === '—') return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

function handleSignals(): CommandResult {
  const lines: ResultLine[] = [
    line('SIGNALS  —  Intelligence feed', 'header'),
    divider(),
  ];

  for (const sig of MOCK_SIGNALS.slice(0, 8)) {
    const cat = sig.category.toUpperCase().padEnd(12);
    const conf = `${sig.confidence}%`.padStart(4);
    lines.push(line(`[${cat}]  ${conf}  ${truncate(sig.title, 54)}`, 'value'));
    lines.push(line(`         ${sig.entityName}  ·  ${formatDate(sig.date)}`, 'dim'));
  }

  lines.push(divider());
  lines.push(line(`${MOCK_SIGNALS.length} signals total  ·  type "explain <id>" for detail`, 'dim'));
  return { type: 'lines', lines };
}

function handleEvents(): CommandResult {
  const recent = getRecentEvents(30);
  const lines: ResultLine[] = [
    line(`EVENTS  —  Last 30 days  (${recent.length} found)`, 'header'),
    divider(),
  ];

  for (const ev of recent.slice(0, 8)) {
    const type = ev.type.toUpperCase().padEnd(13);
    const amount = ev.amount ? `  ${ev.amount}` : '';
    lines.push(line(`[${type}]  ${truncate(ev.title, 48)}${amount}`, 'value'));
    lines.push(line(`              ${ev.entityName}  ·  ${formatDate(ev.date)}`, 'dim'));
  }

  lines.push(divider());
  lines.push(line(`${recent.length} events  ·  type "entity <name>" for entity drill-down`, 'dim'));
  return { type: 'lines', lines };
}

function handleEntity(args: string[]): CommandResult {
  if (args.length === 0) {
    return { type: 'error', message: 'Usage: entity <name>  e.g. entity openai' };
  }

  const query = args.join(' ');
  const entity = resolveEntity(query);

  if (!entity) {
    return {
      type: 'error',
      message: `No entity found for "${query}".  Try: openai, anthropic, meta, mistral, xai, perplexity, nvidia, cohere`,
    };
  }

  const risk = entity.riskLevel.toUpperCase();
  const lines: ResultLine[] = [
    line(entity.name, 'header'),
    divider(),
    line(`Sector          ${entity.sector}`, 'value'),
    line(`Country         ${entity.country}`, 'value'),
    line(`Founded         ${entity.founded}`, 'value'),
    line(`Website         ${entity.website}`, 'dim'),
    line('', 'dim'),
    line(`Signals detected     ${entity.signalCount}`, 'key'),
    line(`Events last 30 days  ${entity.eventCount30d}`, 'key'),
    line(`Risk level           ${risk}`, entity.riskLevel === 'high' ? 'warning' : 'key'),
    line('', 'dim'),
    line('Latest signal', 'accent'),
    line(`  ${truncate(entity.latestSignal, 60)}`, 'value'),
    line('', 'dim'),
    line('Intelligence summary', 'accent'),
    line(`  ${truncate(entity.summary, 72)}`, 'dim'),
  ];

  if (entity.financialScale) {
    lines.push(line('', 'dim'));
    lines.push(line(`Scale           ${entity.financialScale}`, 'dim'));
  }

  lines.push(divider());
  lines.push(line(`Tags: ${entity.tags.join('  ·  ')}`, 'dim'));
  return { type: 'lines', lines };
}

function handleTimeline(args: string[]): CommandResult {
  if (args.length === 0) {
    return { type: 'error', message: 'Usage: timeline <signal-id>  e.g. timeline sig-001' };
  }

  const id = args[0];
  const signal = getSignalById(id);

  if (!signal) {
    return {
      type: 'error',
      message: `Signal "${id}" not found.  Type "signals" to browse available signal IDs.`,
    };
  }

  const related = (signal.relatedIds ?? [])
    .map((rid) => MOCK_SIGNALS.find((s) => s.id === rid))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const lines: ResultLine[] = [
    line(`TIMELINE  —  ${signal.id}`, 'header'),
    divider(),
    line(truncate(signal.title, 64), 'value'),
    line(`${signal.entityName}  ·  ${signal.category.toUpperCase()}  ·  ${formatDate(signal.date)}`, 'dim'),
    line('', 'dim'),
    line(`Confidence  ${signal.confidence}%`, 'key'),
    line('', 'dim'),
    line('Summary', 'accent'),
    line(`  ${signal.summary}`, 'dim'),
  ];

  if (related.length > 0) {
    lines.push(line('', 'dim'));
    lines.push(line('Related signals', 'accent'));
    for (const r of related) {
      lines.push(line(`  ${r.id}  ${truncate(r.title, 52)}`, 'value'));
      lines.push(line(`          ${formatDate(r.date)}  ·  ${r.confidence}% confidence`, 'dim'));
    }
  }

  lines.push(divider());
  lines.push(line(`Type "explain ${id}" for deeper analysis`, 'dim'));
  return { type: 'lines', lines };
}

function handleSnapshot(): CommandResult {
  const recent30 = getRecentEvents(30);
  const signalsByCategory = MOCK_SIGNALS.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] ?? 0) + 1;
    return acc;
  }, {});

  const avgConf = Math.round(
    MOCK_SIGNALS.reduce((sum, s) => sum + s.confidence, 0) / MOCK_SIGNALS.length
  );

  const lines: ResultLine[] = [
    line('SNAPSHOT  —  AI Ecosystem Intelligence', 'header'),
    divider(),
    line(`Total signals         ${MOCK_SIGNALS.length}`, 'key'),
    line(`Events last 30 days   ${recent30.length}`, 'key'),
    line(`Entities tracked      ${MOCK_ENTITIES.length}`, 'key'),
    line(`Avg signal confidence ${avgConf}%`, 'key'),
    line('', 'dim'),
    line('Signal breakdown', 'accent'),
  ];

  for (const [cat, count] of Object.entries(signalsByCategory).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.min(count * 3, 24));
    lines.push(line(`  ${cat.padEnd(14)}  ${String(count).padStart(2)}  ${bar}`, 'value'));
  }

  lines.push(divider());
  lines.push(line('Type "top entities" to rank by signal volume', 'dim'));
  return { type: 'lines', lines };
}

function handleCompare(args: string[]): CommandResult {
  if (args.length < 2) {
    return { type: 'error', message: 'Usage: compare <entity1> <entity2>  e.g. compare openai anthropic' };
  }

  // Heuristic split: last arg vs everything before for multi-word names
  const mid = Math.floor(args.length / 2);
  const q1 = args.slice(0, mid).join(' ');
  const q2 = args.slice(mid).join(' ');

  const a = resolveEntity(q1) ?? resolveEntity(args[0]);
  const b = resolveEntity(q2) ?? resolveEntity(args[args.length - 1]);

  if (!a || !b) {
    const missing = !a ? q1 : q2;
    return { type: 'error', message: `Entity not found: "${missing}"` };
  }

  const col = (v: string) => String(v).padEnd(22);

  const lines: ResultLine[] = [
    line(`COMPARE  —  ${a.name}  vs  ${b.name}`, 'header'),
    divider(),
    line(`${'Dimension'.padEnd(20)}  ${col(a.name)}  ${b.name}`, 'accent'),
    line(`${'─'.repeat(20)}  ${'─'.repeat(22)}  ${'─'.repeat(20)}`, 'divider'),
    line(`${'Sector'.padEnd(20)}  ${col(a.sector)}  ${b.sector}`, 'value'),
    line(`${'Country'.padEnd(20)}  ${col(a.country)}  ${b.country}`, 'value'),
    line(`${'Founded'.padEnd(20)}  ${col(String(a.founded))}  ${b.founded}`, 'value'),
    line(`${'Signals'.padEnd(20)}  ${col(String(a.signalCount))}  ${b.signalCount}`, 'key'),
    line(`${'Events (30d)'.padEnd(20)}  ${col(String(a.eventCount30d))}  ${b.eventCount30d}`, 'key'),
    line(`${'Risk level'.padEnd(20)}  ${col(a.riskLevel.toUpperCase())}  ${b.riskLevel.toUpperCase()}`, 'key'),
    line(`${'Scale'.padEnd(20)}  ${col(a.financialScale ?? '—')}  ${b.financialScale ?? '—'}`, 'dim'),
    divider(),
    line(`${a.name}: ${truncate(a.summary, 58)}`, 'dim'),
    line(`${b.name}: ${truncate(b.summary, 58)}`, 'dim'),
  ];

  return { type: 'lines', lines };
}

function handleSearch(args: string[]): CommandResult {
  if (args.length === 0) {
    return { type: 'error', message: 'Usage: search <keyword>  e.g. search funding' };
  }

  const kw = args.join(' ').toLowerCase();

  const matchedSignals = MOCK_SIGNALS.filter(
    (s) =>
      s.title.toLowerCase().includes(kw) ||
      s.summary.toLowerCase().includes(kw) ||
      s.entityName.toLowerCase().includes(kw) ||
      s.category.toLowerCase().includes(kw)
  );

  const matchedEvents = MOCK_EVENTS.filter(
    (e) =>
      e.title.toLowerCase().includes(kw) ||
      e.description.toLowerCase().includes(kw) ||
      e.entityName.toLowerCase().includes(kw) ||
      e.type.toLowerCase().includes(kw)
  );

  const matchedEntities = MOCK_ENTITIES.filter(
    (e) =>
      e.name.toLowerCase().includes(kw) ||
      e.sector.toLowerCase().includes(kw) ||
      e.summary.toLowerCase().includes(kw) ||
      e.tags.some((t) => t.toLowerCase().includes(kw))
  );

  const total = matchedSignals.length + matchedEvents.length + matchedEntities.length;

  const lines: ResultLine[] = [
    line(`SEARCH  —  "${kw}"  (${total} result${total !== 1 ? 's' : ''})`, 'header'),
    divider(),
  ];

  if (matchedSignals.length > 0) {
    lines.push(line(`Signals (${matchedSignals.length})`, 'accent'));
    for (const s of matchedSignals.slice(0, 4)) {
      lines.push(line(`  ${s.id}  ${truncate(s.title, 52)}`, 'value'));
      lines.push(line(`        ${s.entityName}  ·  ${formatDate(s.date)}`, 'dim'));
    }
    lines.push(line('', 'dim'));
  }

  if (matchedEvents.length > 0) {
    lines.push(line(`Events (${matchedEvents.length})`, 'accent'));
    for (const e of matchedEvents.slice(0, 4)) {
      lines.push(line(`  ${e.id}  ${truncate(e.title, 52)}`, 'value'));
      lines.push(line(`        ${e.entityName}  ·  ${formatDate(e.date)}`, 'dim'));
    }
    lines.push(line('', 'dim'));
  }

  if (matchedEntities.length > 0) {
    lines.push(line(`Entities (${matchedEntities.length})`, 'accent'));
    for (const e of matchedEntities) {
      lines.push(line(`  ${e.id.padEnd(20)}  ${e.name}  ·  ${e.sector}`, 'value'));
    }
  }

  if (total === 0) {
    lines.push(line(`No results for "${kw}". Try: openai, funding, regulation, models`, 'dim'));
  }

  lines.push(divider());
  return { type: 'lines', lines };
}

function handleTopEntities(): CommandResult {
  const top = getTopEntities(8);
  const lines: ResultLine[] = [
    line('TOP ENTITIES  —  Ranked by signal volume', 'header'),
    divider(),
  ];

  top.forEach((e, i) => {
    const rank = String(i + 1).padStart(2);
    const bar = '▓'.repeat(Math.min(e.signalCount * 2, 14));
    const risk = e.riskLevel.padEnd(6);
    lines.push(
      line(
        `${rank}.  ${e.name.padEnd(22)}  ${String(e.signalCount).padStart(2)} signals  [${risk}]  ${bar}`,
        'value'
      )
    );
  });

  lines.push(divider());
  lines.push(line('Type "entity <name>" to drill into any entity', 'dim'));
  return { type: 'lines', lines };
}

function handleMap(): CommandResult {
  const sectors = MOCK_ENTITIES.reduce<Record<string, string[]>>((acc, e) => {
    if (!acc[e.sector]) acc[e.sector] = [];
    acc[e.sector].push(e.name);
    return acc;
  }, {});

  const lines: ResultLine[] = [
    line('MAP  —  AI Ecosystem by sector', 'header'),
    divider(),
  ];

  for (const [sector, names] of Object.entries(sectors)) {
    lines.push(line(sector, 'accent'));
    for (const name of names) {
      const ent = MOCK_ENTITIES.find((e) => e.name === name)!;
      const dot = ent.riskLevel === 'high' ? '●' : ent.riskLevel === 'medium' ? '◐' : '○';
      lines.push(line(`  ${dot}  ${name.padEnd(24)}  ${ent.signalCount} sig  ·  ${ent.eventCount30d} events/30d`, 'value'));
    }
    lines.push(line('', 'dim'));
  }

  lines.push(divider());
  lines.push(line('● high risk  ◐ medium  ○ low', 'dim'));
  return { type: 'lines', lines };
}

function handleExplain(args: string[]): CommandResult {
  if (args.length === 0) {
    return { type: 'error', message: 'Usage: explain <signal-id>  e.g. explain sig-001' };
  }

  const id = args[0];
  const signal = getSignalById(id);

  if (!signal) {
    return {
      type: 'error',
      message: `Signal "${id}" not found.  Type "signals" to browse.`,
    };
  }

  const entity = MOCK_ENTITIES.find((e) => e.id === signal.entityId);

  const lines: ResultLine[] = [
    line(`EXPLAIN  —  ${signal.id}`, 'header'),
    divider(),
    line(signal.title, 'value'),
    line('', 'dim'),
    line('Category', 'accent'),
    line(`  ${signal.category.toUpperCase()}`, 'value'),
    line('', 'dim'),
    line('Entity', 'accent'),
    line(`  ${signal.entityName}  (${entity?.sector ?? 'Unknown'}, ${entity?.country ?? 'Unknown'})`, 'value'),
    line('', 'dim'),
    line('Detected', 'accent'),
    line(`  ${formatDate(signal.date)}`, 'value'),
    line('', 'dim'),
    line('Confidence', 'accent'),
    line(`  ${signal.confidence}%  — ${'█'.repeat(Math.round(signal.confidence / 5))}`, 'key'),
    line('', 'dim'),
    line('Summary', 'accent'),
    line(`  ${signal.summary}`, 'dim'),
  ];

  if (signal.relatedIds && signal.relatedIds.length > 0) {
    lines.push(line('', 'dim'));
    lines.push(line('Related signals', 'accent'));
    for (const rid of signal.relatedIds) {
      const rel = MOCK_SIGNALS.find((s) => s.id === rid);
      if (rel) {
        lines.push(line(`  ${rel.id}  ${truncate(rel.title, 52)}`, 'value'));
      }
    }
  }

  lines.push(divider());
  lines.push(line(`Type "timeline ${id}" to see the event timeline`, 'dim'));
  return { type: 'lines', lines };
}

function handleHelp(): CommandResult {
  const cmds: [string, string][] = [
    ['signals', 'Browse all intelligence signals'],
    ['events', 'Events from the last 30 days'],
    ['entity <name>', 'Entity profile  (e.g. entity openai)'],
    ['timeline <id>', 'Signal timeline  (e.g. timeline sig-001)'],
    ['snapshot', 'Overall ecosystem snapshot'],
    ['compare <a> <b>', 'Side-by-side comparison  (e.g. compare openai anthropic)'],
    ['search <kw>', 'Search across signals, events, entities'],
    ['top entities', 'Entities ranked by signal volume'],
    ['map', 'Ecosystem map by sector'],
    ['explain <id>', 'Deep-dive on a signal  (e.g. explain sig-001)'],
    ['help', 'Show this help text'],
  ];

  const lines: ResultLine[] = [
    line('HELP  —  Supported commands', 'header'),
    divider(),
  ];

  for (const [cmd, desc] of cmds) {
    lines.push(line(`  ${cmd.padEnd(26)}  ${desc}`, 'value'));
  }

  lines.push(divider());
  lines.push(line('Prefix with / or type bare command.  Args are case-insensitive.', 'dim'));
  return { type: 'lines', lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route a parsed command to its handler and return a CommandResult.
 */
export function routeCommand(command: Command): CommandResult {
  if (!command.name) {
    return handleHelp();
  }

  switch (command.name) {
    case 'signals':
      return handleSignals();

    case 'events':
      return handleEvents();

    case 'entity':
      return handleEntity(command.args);

    case 'timeline':
      return handleTimeline(command.args);

    case 'snapshot':
      return handleSnapshot();

    case 'compare':
      return handleCompare(command.args);

    case 'search':
      return handleSearch(command.args);

    case 'top':
      // Accept "top entities" or just "top"
      return handleTopEntities();

    case 'map':
      return handleMap();

    case 'explain':
      return handleExplain(command.args);

    case 'help':
      return handleHelp();

    default:
      return {
        type: 'error',
        message: `Unknown command: "${command.name}".  Type "help" to see supported commands.`,
      };
  }
}
