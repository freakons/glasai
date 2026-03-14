/**
 * Omterminal — Prebuild Deployment Check
 *
 * Runs before `next build` to validate that all required environment
 * variables are present.  Skipped in development (NODE_ENV !== 'production').
 *
 * This is a standalone JS file so it can execute via `node` without
 * TypeScript compilation or path-alias resolution.  The canonical logic
 * lives in src/lib/deploymentGuard.ts for in-app use.
 */

const REQUIRED_VARS = [
  'DATABASE_URL',
  'CRON_SECRET',
  'ADMIN_SECRET',
  'GNEWS_API_KEY',
];

const OPTIONAL_VARS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'GROQ_API_KEY',
  'GROK_API_KEY',
  'OPENAI_API_KEY',
  'RESEND_KEY',
];

function run() {
  // Only enforce in production builds
  if (process.env.NODE_ENV !== 'production') {
    console.log('[deployment-check] Skipping — NODE_ENV is not production.');
    return;
  }

  const missingRequired = REQUIRED_VARS.filter((v) => !process.env[v]);
  const missingOptional = OPTIONAL_VARS.filter((v) => !process.env[v]);

  console.log('\n========================================');
  console.log('  OMTERMINAL DEPLOYMENT CHECK');
  console.log('========================================\n');

  // Required variables
  if (missingRequired.length > 0) {
    console.error('  Required variables MISSING: ' + missingRequired.join(', '));
  } else {
    console.log('  Required variables OK');
  }

  // Optional variables
  if (missingOptional.length > 0) {
    console.warn('  Optional variables missing: ' + missingOptional.join(', '));
  } else {
    console.log('  Optional variables OK');
  }

  // Node runtime
  console.log('  Node runtime: ' + process.version);

  // Verdict
  if (missingRequired.length > 0) {
    console.error('\n  Deployment BLOCKED — fix required variables before deploying.\n');
    process.exit(1);
  }

  console.log('\n  Deployment safe\n');
}

run();
