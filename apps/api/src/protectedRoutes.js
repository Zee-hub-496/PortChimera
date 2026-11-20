/** Mount prefix for every router that needs a sign-in. This list is the single source of truth. */
export const PROTECTED_PREFIXES = Object.freeze({
  auth: '/api/auth',
  shipments: '/api/shipments',
  ports: '/api/ports',
  routes: '/api/routes',
});

/**
 * Mounts each router behind `protect`. `routerFactories` must have one factory per entry in
 * PROTECTED_PREFIXES; a missing or extra one throws, so a route cannot be mounted unprotected
 * or forgotten silently. Takes any app-like object with `use`, so tests need no Express.
 */
export function mountProtectedRoutes(app, protect, routerFactories) {
  const names = Object.keys(PROTECTED_PREFIXES);
  const given = Object.keys(routerFactories);
  const wrong = names
    .filter((n) => !given.includes(n))
    .concat(given.filter((n) => !names.includes(n)));
  if (wrong.length > 0) throw new Error(`Protected routes mismatch: ${wrong.join(', ')}`);
  for (const name of names) app.use(PROTECTED_PREFIXES[name], protect, routerFactories[name]());
}
