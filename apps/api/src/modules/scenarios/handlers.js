import {
  addEffect,
  createScenario,
  deleteScenario,
  getScenario,
  listScenarios,
  removeEffect,
  simulateScenario,
  updateScenario,
} from './service.js';

/**
 * Express handlers for /api/scenarios. Parsers and the routing engine are injected (routes.js
 * passes zod-based parsers and @portchimera/core), so tests can run without either.
 * Ownership always comes from req.auth.userId, never from the body or URL.
 *
 * @param {{parsers: {id: Function, create: Function, update: Function, effect: Function, simulate: Function}, engine: object, logger?: object}} deps
 */
export function scenarioHandlers({ parsers, engine, logger = console }) {
  return {
    async create(req, res) {
      const input = parsers.create(req.body);
      res.status(201).json({
        data: await createScenario(req.db, req.auth.userId, input, engine, logger),
      });
    },
    async list(req, res) {
      res.json({ data: await listScenarios(req.db, req.auth.userId) });
    },
    async get(req, res) {
      res.json({ data: await getScenario(req.db, req.auth.userId, parsers.id(req.params.id)) });
    },
    async update(req, res) {
      const id = parsers.id(req.params.id);
      const input = parsers.update(req.body);
      res.json({ data: await updateScenario(req.db, req.auth.userId, id, input, logger) });
    },
    async remove(req, res) {
      const id = parsers.id(req.params.id);
      res.json({ data: await deleteScenario(req.db, req.auth.userId, id, logger) });
    },
    async addEffect(req, res) {
      const id = parsers.id(req.params.id);
      const input = parsers.effect(req.body);
      res.status(201).json({
        data: await addEffect(req.db, req.auth.userId, id, input, engine, logger),
      });
    },
    async removeEffect(req, res) {
      const id = parsers.id(req.params.id);
      const effectId = parsers.id(req.params.effectId);
      res.json({ data: await removeEffect(req.db, req.auth.userId, id, effectId, logger) });
    },
    async simulate(req, res) {
      const id = parsers.id(req.params.id);
      const input = parsers.simulate(req.body);
      res.json({
        data: await simulateScenario(req.db, req.auth.userId, id, input, engine, logger),
      });
    },
  };
}
