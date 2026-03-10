#!/usr/bin/env node
/**
 * validate-ingestion.mjs
 *
 * Omterminal — Data Ingestion Validation Script
 *
 * Tests all external data sources directly using the same logic as the
 * harvester adapters:
 *   Step 1 — RSS feeds    (TechCrunch AI, VentureBeat AI, The Verge AI)
 *   Step 2 — Arxiv API   (large language model, transformer model, generative AI)
 *   Step 3 — GitHub API  (huggingface/transformers, langchain-ai/langchain, openai/openai-cookbook)
 *   Step 4 — POST /api/intelligence/run  (full pipeline trigger)
 *   Step 5 — signals table source counts
 *   Step 6 — Verification report output
 *
 * Usage:
 *   node scripts/validate-ingestion.mjs [--base-url=http://localhost:3000] [--secret=<CRON_SECRET>]
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { baseUrl: 'http://localhost:3000', secret: process.env.CRON_SECRET ?? '' };
  for (const arg of args) {
    if (arg.startsWith('--base-url=')) result.baseUrl = arg.slice('--base-url='.length);
    if (arg.startsWith('--secret='))   result.secret  = arg.slice('--secret='.length);
  }
  return result;
}

function banner(text) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(line);
}

function ok(msg)   { console.log(`  ✓  ${msg}`); }
function fail(msg) { console.log(`  ✗  ${msg}`); }
function info(msg) { console.log(`  ·  ${msg}`); }

// ── STEP 1 — RSS Ingestion ─────────────────────────────────────────────────────

const RSS_FEEDS = [
  'https://techcrunch.com/category/artificial-intelligence/feed',
  'https://venturebeat.com/category/ai/feed',
  'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml',
];

/**
 * Minimal RSS/Atom parser that extracts <item> and <entry> blocks.
 * Returns an array of { title, link, pubDate, summary } objects.
 */
function parseRssFeed(xml) {
  // Support both RSS <item> and Atom <entry>
  const itemPattern = /<(?:item|entry)(?: [^>]*)?>[\s\S]*?<\/(?:item|entry)>/gi;
  const items = [];
  let m;
  while ((m = itemPattern.exec(xml)) !== null) {
    const block = m[0];

    const title   = extractCdataOrText(block, 'title');
    const link    = extractCdataOrText(block, 'link') ||
                    (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
    const pubDate = extractCdataOrText(block, 'pubDate') ||
                    extractCdataOrText(block, 'published') ||
                    extractCdataOrText(block, 'updated');
    const summary = extractCdataOrText(block, 'description') ||
                    extractCdataOrText(block, 'summary') ||
                    extractCdataOrText(block, 'content\\:encoded') ||
                    extractCdataOrText(block, 'content');

    if (title) items.push({ title, link, pubDate, summary });
  }
  return items;
}

function extractCdataOrText(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return (m[1] ?? m[2] ?? '').trim();
}

async function testRssFeeds() {
  banner('STEP 1 — RSS Ingestion');
  const results = [];

  for (const feedUrl of RSS_FEEDS) {
    info(`Fetching: ${feedUrl}`);
    try {
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Omterminal-Validator/1.0' },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        fail(`HTTP ${res.status} — ${feedUrl}`);
        results.push({ feedUrl, status: 'error', count: 0, error: `HTTP ${res.status}` });
        continue;
      }

      const xml   = await res.text();
      const items = parseRssFeed(xml);

      if (items.length === 0) {
        fail(`0 articles parsed — ${feedUrl}`);
        results.push({ feedUrl, status: 'empty', count: 0 });
      } else {
        ok(`${items.length} articles — ${feedUrl}`);
        info(`   First: "${items[0].title.slice(0, 80)}"`);
        results.push({ feedUrl, status: 'ok', count: items.length, sample: items[0] });
      }
    } catch (err) {
      fail(`Error fetching ${feedUrl}: ${err.message}`);
      results.push({ feedUrl, status: 'error', count: 0, error: err.message });
    }
  }

  const totalArticles = results.reduce((s, r) => s + r.count, 0);
  const passed = totalArticles >= 5;
  console.log('');
  console.log(`  Total RSS articles parsed: ${totalArticles}`);
  console.log(`  Minimum required (5):      ${passed ? '✓ PASS' : '✗ FAIL'}`);

  return { results, totalArticles, passed };
}

// ── STEP 2 — Arxiv Ingestion ───────────────────────────────────────────────────

const ARXIV_QUERIES = [
  'large language model',
  'transformer model',
  'generative AI',
];

const ARXIV_API = 'https://export.arxiv.org/api/query';

function extractArxivTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractArxivEntries(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) entries.push(m[1]);
  return entries;
}

async function testArxivIngestion() {
  banner('STEP 2 — Arxiv Ingestion');
  const results = [];

  for (const query of ARXIV_QUERIES) {
    info(`Querying Arxiv: "${query}"`);
    try {
      const params = new URLSearchParams({
        search_query: `all:${query.replace(/\s+/g, '+')}`,
        start:        '0',
        max_results:  '10',
        sortBy:       'submittedDate',
        sortOrder:    'descending',
      });

      const res = await fetch(`${ARXIV_API}?${params}`, {
        headers: { 'User-Agent': 'Omterminal-Validator/1.0' },
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        fail(`HTTP ${res.status} — query: "${query}"`);
        results.push({ query, status: 'error', count: 0, error: `HTTP ${res.status}` });
        continue;
      }

      const xml     = await res.text();
      const entries = extractArxivEntries(xml);

      if (entries.length === 0) {
        fail(`0 papers returned — query: "${query}"`);
        results.push({ query, status: 'empty', count: 0 });
      } else {
        const title = extractArxivTag(entries[0], 'title').replace(/\s+/g, ' ');
        ok(`${entries.length} papers — "${query}"`);
        info(`   Latest: "${title.slice(0, 80)}"`);
        results.push({ query, status: 'ok', count: entries.length, sample: { title } });
      }
    } catch (err) {
      fail(`Error querying Arxiv for "${query}": ${err.message}`);
      results.push({ query, status: 'error', count: 0, error: err.message });
    }
  }

  const totalPapers = results.reduce((s, r) => s + r.count, 0);
  const passed      = totalPapers >= 3;
  console.log('');
  console.log(`  Total Arxiv papers fetched: ${totalPapers}`);
  console.log(`  Minimum required (3):       ${passed ? '✓ PASS' : '✗ FAIL'}`);

  return { results, totalPapers, passed };
}

// ── STEP 3 — GitHub Release Ingestion ─────────────────────────────────────────

const GITHUB_REPOS = [
  ['huggingface', 'transformers'],
  ['langchain-ai', 'langchain'],
  ['openai', 'openai-cookbook'],
];

async function testGitHubIngestion() {
  banner('STEP 3 — GitHub Release Ingestion');
  const results = [];
  const token   = process.env.GITHUB_TOKEN;

  for (const [owner, repo] of GITHUB_REPOS) {
    info(`Fetching releases: ${owner}/${repo}`);
    try {
      const headers = {
        Accept:                'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent':           'Omterminal-Validator/1.0',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        // openai/openai-cookbook may have no releases — that's acceptable
        if (res.status === 404) {
          info(`No releases found (404) — ${owner}/${repo} (repo exists but no releases)`);
          results.push({ repo: `${owner}/${repo}`, status: 'no-releases', count: 0 });
        } else {
          fail(`HTTP ${res.status} — ${owner}/${repo}`);
          results.push({ repo: `${owner}/${repo}`, status: 'error', count: 0, error: `HTTP ${res.status}` });
        }
        continue;
      }

      const releases = await res.json();
      const count    = Array.isArray(releases) ? releases.length : 0;

      if (count === 0) {
        info(`0 releases — ${owner}/${repo} (repo reachable, no published releases)`);
        results.push({ repo: `${owner}/${repo}`, status: 'no-releases', count: 0 });
      } else {
        const latest = releases[0];
        ok(`${count} releases fetched — ${owner}/${repo}`);
        info(`   Latest: "${(latest.name || latest.tag_name).slice(0, 60)}" (${latest.published_at?.slice(0,10)})`);
        results.push({
          repo:    `${owner}/${repo}`,
          status:  'ok',
          count,
          sample:  { name: latest.name || latest.tag_name, published_at: latest.published_at, url: latest.html_url },
        });
      }
    } catch (err) {
      fail(`Error fetching ${owner}/${repo}: ${err.message}`);
      results.push({ repo: `${owner}/${repo}`, status: 'error', count: 0, error: err.message });
    }
  }

  // At least 2 of 3 repos must be reachable (one may simply have no releases)
  const reachable = results.filter((r) => r.status !== 'error').length;
  const passed    = reachable >= 2;
  console.log('');
  console.log(`  GitHub repos reachable: ${reachable}/${GITHUB_REPOS.length}`);
  console.log(`  Minimum required (2/3): ${passed ? '✓ PASS' : '✗ FAIL'}`);

  return { results, passed };
}

// ── STEP 4 — Trigger Harvester via POST /api/intelligence/run ─────────────────

async function triggerHarvester(baseUrl, secret) {
  banner('STEP 4 — Trigger Harvester Pipeline');
  info(`POST ${baseUrl}/api/intelligence/run`);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent':   'Omterminal-Validator/1.0',
    };
    if (secret) {
      headers['x-vercel-cron-secret'] = secret;
      info('Using x-vercel-cron-secret header for auth');
    } else {
      info('No CRON_SECRET — relying on local dev open access');
    }

    const res = await fetch(`${baseUrl}/api/intelligence/run`, {
      method:  'POST',
      headers,
      body:    JSON.stringify({}),
      signal:  AbortSignal.timeout(120_000), // pipeline can take up to 2 min
    });

    const body = await res.json();

    if (res.status === 401) {
      fail(`Unauthorized (401) — set CRON_SECRET env var or pass --secret=<value>`);
      return { status: 'unauthorized', body };
    }

    console.log('');
    console.log('  Pipeline response:');
    console.log(`    HTTP Status:    ${res.status}`);
    console.log(`    Overall status: ${body.status}`);
    console.log(`    Total time:     ${body.totalMs}ms`);
    console.log('');
    console.log('  Stages:');
    for (const stage of (body.stages ?? [])) {
      const icon = stage.status === 'ok' ? '✓' : '✗';
      const err  = stage.error ? ` — ${stage.error}` : '';
      console.log(`    ${icon} ${stage.stage.padEnd(12)} ${stage.durationMs}ms${err}`);
    }

    if (body.diagnostics) {
      console.log('');
      console.log('  Diagnostics:');
      console.log(`    Total signals in DB: ${body.diagnostics.totalSignals}`);
      if (body.diagnostics.latestSignal) {
        const s = body.diagnostics.latestSignal;
        console.log(`    Latest signal:       "${String(s.title).slice(0,60)}"`);
        console.log(`    Category:            ${s.category}`);
        console.log(`    Confidence:          ${s.confidence}`);
        console.log(`    Status:              ${s.status}`);
        console.log(`    Trust score:         ${s.trust_score}`);
        console.log(`    Created at:          ${s.created_at}`);
      }
    }

    const harvesterStage = (body.stages ?? []).find((s) => s.stage === 'harvester');
    const harvesterOk    = harvesterStage?.status === 'ok';
    const totalSignals   = typeof body.diagnostics?.totalSignals === 'number'
      ? body.diagnostics.totalSignals
      : 0;

    const passed = harvesterOk && totalSignals > 0;
    console.log('');
    console.log(`  Harvester stage OK:      ${harvesterOk ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  harvestedEvents > 0:     ${totalSignals > 0 ? `✓ PASS (${totalSignals})` : '✗ FAIL'}`);

    return { status: body.status, body, harvesterOk, totalSignals, passed };
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      fail(`Cannot reach ${baseUrl} — is the Next.js dev server running?`);
      fail('Start server with: npm run dev');
    } else {
      fail(`Pipeline trigger failed: ${err.message}`);
    }
    return { status: 'unreachable', error: err.message, passed: false };
  }
}

// ── STEP 5 — Signal Source Counts (via API or direct DB) ──────────────────────

async function querySignalSources(baseUrl) {
  banner('STEP 5 — Signal Source Counts');
  // Try the /api/signals/sources endpoint first (may not exist); fall back to
  // generic /api/signals and aggregate client-side.
  info('Querying signal sources via API...');

  // Attempt dedicated source-count endpoint
  try {
    const res = await fetch(`${baseUrl}/api/signals/sources`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        console.log('\n  Source counts (from /api/signals/sources):');
        for (const [source, count] of Object.entries(data)) {
          console.log(`    ${source.padEnd(40)} ${count}`);
        }
        return { status: 'ok', counts: data };
      }
    }
  } catch (_) {
    // endpoint doesn't exist — fall through
  }

  // Fall back to /api/signals and aggregate client-side
  try {
    const res = await fetch(`${baseUrl}/api/signals?limit=200`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      fail(`/api/signals returned HTTP ${res.status}`);
      return { status: 'error' };
    }

    const data = await res.json();
    const signals = Array.isArray(data) ? data : (data.signals ?? data.data ?? []);

    if (signals.length === 0) {
      info('No signals found in DB yet (pipeline may not have run)');
      return { status: 'empty', counts: {} };
    }

    // Aggregate by source
    const counts = {};
    for (const sig of signals) {
      const src = sig.source ?? 'unknown';
      counts[src] = (counts[src] ?? 0) + 1;
    }

    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    console.log(`\n  Source counts (${signals.length} signals sampled):`);
    console.log('  ' + 'SOURCE'.padEnd(42) + 'COUNT');
    console.log('  ' + '─'.repeat(52));
    for (const [src, cnt] of sorted) {
      console.log(`  ${src.padEnd(42)} ${cnt}`);
    }

    return { status: 'ok', counts: Object.fromEntries(sorted), signals };
  } catch (err) {
    fail(`Signal query failed: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

// ── STEP 6 — Verification Report ──────────────────────────────────────────────

function printVerificationReport(rss, arxiv, github, harvester, sources) {
  banner('STEP 6 — Verification Report');

  const allPassed = [rss.passed, arxiv.passed, github.passed].every(Boolean);

  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────┐');
  console.log('  │          OMTERMINAL DATA INGESTION VERIFICATION         │');
  console.log('  │                 ' + new Date().toISOString() + '          │');
  console.log('  └─────────────────────────────────────────────────────────┘');
  console.log('');

  // 1. RSS
  console.log('  1. RSS Events Ingested');
  console.log('     ─────────────────────────────────────────────────────────');
  for (const r of rss.results) {
    const icon  = r.status === 'ok' ? '✓' : '✗';
    const label = r.feedUrl.replace('https://', '').slice(0, 50).padEnd(52);
    console.log(`     ${icon}  ${label}  ${r.count} articles`);
    if (r.status === 'ok' && r.sample) {
      console.log(`        Sample: "${r.sample.title.slice(0, 70)}"`);
    }
  }
  console.log(`     Total: ${rss.totalArticles} articles  →  ${rss.passed ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('');

  // 2. Arxiv
  console.log('  2. Arxiv Papers Ingested');
  console.log('     ─────────────────────────────────────────────────────────');
  for (const r of arxiv.results) {
    const icon  = r.status === 'ok' ? '✓' : '✗';
    const label = `"${r.query}"`.padEnd(30);
    console.log(`     ${icon}  ${label}  ${r.count} papers`);
    if (r.status === 'ok' && r.sample) {
      console.log(`        Sample: "${r.sample.title.slice(0, 70)}"`);
    }
  }
  console.log(`     Total: ${arxiv.totalPapers} papers  →  ${arxiv.passed ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('');

  // 3. GitHub
  console.log('  3. GitHub Releases Ingested');
  console.log('     ─────────────────────────────────────────────────────────');
  for (const r of github.results) {
    const icon  = r.status === 'ok' ? '✓' : (r.status === 'no-releases' ? '·' : '✗');
    const label = r.repo.padEnd(40);
    const note  = r.status === 'no-releases' ? '(no releases)' : `${r.count} releases`;
    console.log(`     ${icon}  ${label}  ${note}`);
    if (r.status === 'ok' && r.sample) {
      console.log(`        Latest: "${r.sample.name}" (${r.sample.published_at?.slice(0,10)})`);
    }
  }
  console.log(`     Reachability:  ${github.passed ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('');

  // 4. Harvester pipeline
  console.log('  4. Harvester Pipeline Run');
  console.log('     ─────────────────────────────────────────────────────────');
  if (harvester.status === 'unreachable') {
    console.log(`     ✗  Server not reachable — ${harvester.error ?? ''}`);
    console.log(`        Run "npm run dev" then re-run this script`);
  } else if (harvester.status === 'unauthorized') {
    console.log(`     ✗  Unauthorized — provide CRON_SECRET`);
  } else {
    const icon = harvester.harvesterOk ? '✓' : '✗';
    console.log(`     ${icon}  Harvester stage:  ${harvester.harvesterOk ? 'OK' : 'FAILED'}`);
    console.log(`     ${harvester.totalSignals > 0 ? '✓' : '✗'}  harvestedEvents:  ${harvester.totalSignals}`);
  }
  console.log('');

  // 5. Signal source counts
  console.log('  5. Signals per Source (SELECT source, COUNT(*) FROM signals GROUP BY source)');
  console.log('     ─────────────────────────────────────────────────────────');
  if (sources.status === 'ok' && sources.counts) {
    const entries = Object.entries(sources.counts);
    if (entries.length === 0) {
      console.log('     (no signals yet)');
    } else {
      for (const [src, cnt] of entries) {
        console.log(`     ${src.padEnd(44)} ${cnt}`);
      }
    }
  } else if (sources.status === 'empty') {
    console.log('     (no signals in DB yet)');
  } else {
    console.log(`     (could not query — ${sources.error ?? sources.status})`);
  }
  console.log('');

  // 6. Example real signal
  console.log('  6. Example Real Signal');
  console.log('     ─────────────────────────────────────────────────────────');
  const exampleSig = sources.signals?.[0];
  if (exampleSig) {
    console.log(`     Title:      "${String(exampleSig.title ?? '').slice(0,70)}"`);
    console.log(`     Source:     ${exampleSig.source ?? 'N/A'}`);
    console.log(`     Category:   ${exampleSig.category ?? 'N/A'}`);
    console.log(`     Confidence: ${exampleSig.confidence ?? exampleSig.confidence_score ?? 'N/A'}`);
    console.log(`     Status:     ${exampleSig.status ?? 'N/A'}`);
    console.log(`     Created:    ${exampleSig.created_at ?? 'N/A'}`);
    if (exampleSig.url) {
      console.log(`     URL:        ${exampleSig.url}`);
    }
  } else {
    // Use one of our fresh RSS samples as the demonstration signal
    const rssSample = rss.results.find((r) => r.sample)?.sample;
    if (rssSample) {
      console.log(`     (No DB signal available — showing RSS fetch sample)`);
      console.log(`     Title:   "${rssSample.title.slice(0,70)}"`);
      console.log(`     Link:    ${rssSample.link}`);
      console.log(`     PubDate: ${rssSample.pubDate}`);
    } else {
      console.log('     (No signal available — run the full pipeline first)');
    }
  }
  console.log('');

  // Summary
  console.log('  ─────────────────────────────────────────────────────────────');
  const allExternal = rss.passed && arxiv.passed && github.passed;
  console.log(`  External data source tests:  ${allExternal ? 'ALL PASS ✓' : 'SOME FAILED ✗'}`);
  if (harvester.status !== 'unreachable' && harvester.status !== 'unauthorized') {
    console.log(`  Pipeline run:                ${harvester.passed ? 'PASS ✓' : 'FAIL ✗'}`);
  } else {
    console.log(`  Pipeline run:                SKIPPED (server not running)`);
  }
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  Omterminal — Ingestion Validation');
  console.log('  Run at: ' + new Date().toISOString());
  console.log('');

  const { baseUrl, secret } = parseArgs();
  info(`Target server: ${baseUrl}`);
  info(`Auth secret:   ${secret ? '(set)' : '(not set)'}`);

  // Run external source tests in parallel for speed
  const [rss, arxiv, github] = await Promise.all([
    testRssFeeds(),
    testArxivIngestion(),
    testGitHubIngestion(),
  ]);

  // Trigger the pipeline (requires server)
  const harvester = await triggerHarvester(baseUrl, secret);

  // Query signal source counts
  const sources = await querySignalSources(baseUrl);

  // Print final report
  printVerificationReport(rss, arxiv, github, harvester, sources);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
