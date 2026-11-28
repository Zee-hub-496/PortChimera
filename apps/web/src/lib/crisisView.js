// Pure helpers for the Crisis page. No React, no fetch, so node:test can run them. All numbers and
// wording come from GET /api/scenarios/impact (core's simulateDisruption); this file only picks
// what to show and how to phrase it.
import {
  EFFECT_LABELS,
  STATUS_INFO,
  formatDeltaCost,
  formatDeltaDays,
  formatDeltaRisk,
  deltaTone,
  impactHeadline,
} from './scenarioView.js';

export const CRISIS_NOTICE =
  'These are crises you set up yourself (a closed port or lane), checked against the demo shipping network. They are simulations with illustrative data, not live news or real freight rates.';

/** One effect as a short line, for example "Singapore: port strike". */
export function effectLine(effect) {
  const type = EFFECT_LABELS[effect?.type] ?? String(effect?.type ?? 'closure');
  const prefix = effect?.kind === 'lane' ? 'Lane ' : '';
  return `${prefix}${effect?.target ?? 'Unknown'}: ${type.toLowerCase()}`;
}

/** The top-of-page state: nothing set up, set up but nothing hit, or shipments hit. */
export function crisisSummary(overview) {
  const crises = overview?.crises ?? [];
  const affected = overview?.affectedShipments ?? 0;
  if (crises.length === 0) {
    return {
      state: 'none_set',
      tone: 'neutral',
      title: 'No crises set up yet',
      text: 'A crisis is a closed port or lane. Open a shipment, go to its Route tab and use "What if?" to add one. It will show up here.',
    };
  }
  if (affected === 0) {
    return {
      state: 'no_impact',
      tone: 'success',
      title: 'No crisis affects any of your shipments',
      text: `${crises.length} saved ${crises.length === 1 ? 'crisis does' : 'crises do'} not change the fastest route of any shipment.`,
    };
  }
  return {
    state: 'impact',
    tone: 'warn',
    title: `${affected} ${affected === 1 ? 'shipment is' : 'shipments are'} affected`,
    text: 'Fastest route, before and after each crisis. Open a shipment to try other options.',
  };
}

/** One shipment's row inside a crisis card. */
export function affectedRow(item) {
  const info = STATUS_INFO[item?.status] ?? { tone: 'neutral', title: 'Result' };
  const added = item?.added ?? null;
  return {
    shipmentId: item.shipmentId,
    number: item.shipmentNumber ?? '',
    lane: `${item.origin?.name ?? '?'} to ${item.destination?.name ?? '?'}`,
    status: item.status,
    statusLabel: info.title,
    tone: info.tone,
    rerouted: item.status === 'rerouted',
    before: item.baseline?.pathNames?.join(' > ') ?? '',
    after: item.status === 'rerouted' ? (item.disrupted?.pathNames?.join(' > ') ?? '') : '',
    headline: impactHeadline(item),
    extra: added
      ? [
          {
            key: 'days',
            label: 'Extra time',
            value: formatDeltaDays(added.days),
            tone: deltaTone(added.days),
          },
          {
            key: 'cost',
            label: 'Extra cost',
            value: formatDeltaCost(added.costUsd),
            tone: deltaTone(added.costUsd),
          },
          {
            key: 'risk',
            label: 'Risk change',
            value: formatDeltaRisk(added.risk),
            tone: deltaTone(added.risk),
          },
        ]
      : [],
  };
}

/** Crises that hit something come first (the API already sorts them), with their rows. */
export function crisisCards(overview) {
  return (overview?.crises ?? []).map((c) => ({
    id: c.scenarioId,
    name: c.name,
    effects: (c.effects ?? []).map(effectLine),
    rows: (c.affected ?? []).map(affectedRow),
  }));
}
