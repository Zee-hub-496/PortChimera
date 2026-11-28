import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupe, normalizeTitle, normalizeUrl, stableId } from '../src/intelligence/url.ts';
import {
  classifyCategory,
  classifySource,
  hasClosureLanguage,
  matchGeography,
  matchPorts,
  scoreRelevance,
} from '../src/intelligence/classify.ts';

test('normalizeUrl strips tracking, fragment, www, trailing slash and sorts the query', () => {
  const a = normalizeUrl('https://www.Example.com/News/Story/?utm_source=x&b=2&a=1#top');
  assert.equal(a, 'example.com/News/Story?a=1&b=2');
  assert.equal(normalizeUrl('http://example.com/News/Story?a=1&b=2'), a);
});

test('normalizeUrl rejects non-http schemes and garbage', () => {
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('ftp://example.com/x'), null);
  assert.equal(normalizeUrl('not a url'), null);
});

test('normalizeTitle ignores case, accents and punctuation', () => {
  assert.equal(normalizeTitle('  Tanker  ATTACKED — near Hormuz! '), 'tanker attacked near hormuz');
  assert.equal(normalizeTitle('Café Strike'), 'cafe strike');
});

test('dedupe removes repeated URLs and repeated titles, keeps the first, drops invalid URLs', () => {
  const items = [
    { url: 'https://a.com/x?utm_medium=1', headline: 'Tanker attacked' },
    { url: 'https://www.a.com/x/', headline: 'Different title' },
    { url: 'https://b.com/y', headline: 'TANKER ATTACKED!' },
    { url: 'https://c.com/z', headline: 'Port strike ends' },
    { url: 'garbage', headline: 'Bad url' },
  ];
  const out = dedupe(items);
  assert.deepEqual(
    out.map((i) => i.headline),
    ['Tanker attacked', 'Port strike ends'],
  );
});

test('stableId is deterministic and differs per URL', () => {
  assert.equal(stableId('a.com/x'), stableId('a.com/x'));
  assert.notEqual(stableId('a.com/x'), stableId('a.com/y'));
  assert.match(stableId('a.com/x'), /^[0-9a-f]{8}$/);
});

const CASES: Array<[string, string | null]> = [
  ['Tanker hijacked in the Gulf of Aden', 'HIJACKING'],
  ['Pirates approach bulk carrier off Somalia', 'PIRACY'],
  ['Missile strikes ship in the Red Sea', 'SECURITY_INCIDENT'],
  ['Dockworkers strike closes container terminal', 'PORT_DISRUPTION'],
  ['Suez Canal blocked after container ship runs aground', 'ROUTE_DISRUPTION'],
  ['New sanctions target tanker fleet', 'SANCTIONS'],
  ['Refinery outage cuts crude export terminal loadings', 'ENERGY_SUPPLY'],
  ['Typhoon forces port closures near Shanghai', 'MARINE_WEATHER'],
  ['Local football club wins derby', null],
  ['Missile attack on city kills dozens', null],
];
for (const [text, expected] of CASES) {
  test(`classifyCategory: "${text}" -> ${expected}`, () => {
    assert.equal(classifyCategory(text), expected);
  });
}

test('classifySource: only https official domains are OFFICIAL_SOURCE', () => {
  assert.equal(
    classifySource('https://www.ukmto.org/recent-incidents', 'direct'),
    'OFFICIAL_SOURCE',
  );
  assert.equal(
    classifySource('https://www.maritime.dot.gov/msci-advisories', 'aggregator'),
    'OFFICIAL_SOURCE',
  );
  assert.equal(classifySource('http://www.ukmto.org/x', 'direct'), 'UNVERIFIED_REPORT');
  assert.equal(classifySource('https://ukmto.org.evil.example/x', 'aggregator'), 'MEDIA_REPORT');
  assert.equal(classifySource('https://notimo.org/x', 'aggregator'), 'MEDIA_REPORT');
  assert.equal(classifySource('https://news.example.com/a', 'aggregator'), 'MEDIA_REPORT');
  assert.equal(classifySource('https://blog.example.com/a', 'direct'), 'UNVERIFIED_REPORT');
});

test('a headline claiming to be official does not become official', () => {
  const text = 'OFFICIAL UKMTO ADVISORY: Strait of Hormuz closed';
  assert.equal(classifySource('https://random-news.example/a', 'aggregator'), 'MEDIA_REPORT');
  assert.equal(hasClosureLanguage(text), true);
});

test('matchGeography names chokepoints only when they are named, regions broadly', () => {
  const hormuz = matchGeography('Tanker stopped in the Strait of Hormuz');
  assert.deepEqual(hormuz.chokepointIds, ['hormuz']);
  assert.ok(hormuz.regionIds.includes('persian-gulf'));
  assert.deepEqual(hormuz.location, { lat: 26.5, lon: 56.5 });

  const gulf = matchGeography('Shipping calm across the Persian Gulf');
  assert.deepEqual(gulf.chokepointIds, []);
  assert.equal(gulf.location, null);
  assert.equal(gulf.regionName, 'Persian Gulf');

  const none = matchGeography('Port workers in Brazil vote on contract');
  assert.deepEqual(none.regionIds, []);
  assert.equal(none.location, null);
});

test('matchPorts matches whole port names only', () => {
  const ports = [
    { code: 'NLRTM', name: 'Rotterdam' },
    { code: 'AEJEA', name: 'Jebel Ali' },
    { code: 'XXABC', name: 'Rio' },
  ];
  assert.deepEqual(matchPorts('Strike at Rotterdam port', ports), ['NLRTM']);
  assert.deepEqual(matchPorts('Trip to Jebel Ali and Rotterdam', ports), ['NLRTM', 'AEJEA']);
  assert.deepEqual(matchPorts('Wario world', ports), []);
});

test('scoreRelevance', () => {
  const placed = matchGeography('Missile hits tanker in the Strait of Hormuz');
  assert.equal(scoreRelevance('SECURITY_INCIDENT', placed, []), 'HIGH');
  assert.equal(scoreRelevance('SANCTIONS', placed, []), 'MEDIUM');
  assert.equal(scoreRelevance('PIRACY', matchGeography('somewhere'), []), 'LOW');
});
