#!/usr/bin/env node
/**
 * Privacy guard (PROJECT_PRINCIPLES rule 12).  Fails if any workspace package.json declares a
 * dependency matching a known analytics / advertising / fingerprinting / telemetry vendor.
 * Extend DENY as needed; never shrink it without a note in docs/privacy.md.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DENY = [
  /google-?analytics/i,
  /^gtag/i,
  /^ga-/i,
  /googletagmanager/i,
  /^react-ga/i,
  /segment/i,
  /mixpanel/i,
  /amplitude/i,
  /hotjar/i,
  /fullstory/i,
  /heap-?analytics/i,
  /posthog/i,
  /matomo/i,
  /piwik/i,
  /plausible/i,
  /fathom/i,
  /umami/i,
  /countly/i,
  /@sentry\//i,
  /^sentry/i,
  /bugsnag/i,
  /rollbar/i,
  /datadog/i,
  /newrelic/i,
  /logrocket/i,
  /fingerprintjs/i,
  /@fingerprintjs/i,
  /clientjs/i,
  /evercookie/i,
  /facebook-pixel/i,
  /fbevents/i,
  /adsense/i,
  /doubleclick/i,
  /^appsflyer/i,
  /branch-sdk/i,
  /firebase-analytics/i,
  /@firebase\/analytics/i,
  /intercom/i,
  /drift/i,
  /crisp/i,
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name === 'package.json') yield p;
  }
}

let bad = 0;
for (const file of walk(process.cwd())) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (DENY.some((re) => re.test(dep))) {
        console.error(`✗ ${file}: "${dep}" matches the analytics/tracking deny-list`);
        bad++;
      }
    }
  }
}
if (bad) {
  console.error(
    `\n${bad} forbidden dependenc${bad === 1 ? 'y' : 'ies'} found. See docs/privacy.md.`,
  );
  process.exit(1);
}
console.log('✓ dependency allowlist: no analytics/tracking packages declared');
