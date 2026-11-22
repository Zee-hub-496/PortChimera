// Public surface of the core package. Add exports here as each engine is built and tested.
export { haversineKm } from './routing/haversine.js';
export { MinHeap } from './routing/heap.js';
export { RoutingInputError } from './routing/errors.js';
export { buildGraph } from './routing/graph.js';
export { OBJECTIVES, makeCostFunction, resolveObjective, validateWeights } from './routing/cost.js';
export { findRoute, makeHeuristic, minCostPerKm } from './routing/astar.js';
export { DISRUPTION_TYPES, applyDisruptions, validateEffects } from './routing/disruptions.js';
export { simulateDisruption } from './routing/simulate.js';

export { crossCheck } from './crosscheck/crossCheck.js';
export { CrossCheckInputError } from './crosscheck/errors.js';
export { DOCUMENT_TYPES } from './crosscheck/compare.js';
export { THRESHOLDS as CROSSCHECK_THRESHOLDS } from './crosscheck/severity.js';

export { REQUIRED_DOCUMENT_TYPES, deriveShipmentStatus } from './shipment/status.js';
