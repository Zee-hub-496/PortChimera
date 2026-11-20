// Copy for the public pages. Honest by design: statuses say what is built today.
export const STATUSES = Object.freeze(['available', 'coming soon']);

export const NAV_LINKS = Object.freeze([
  { label: 'Platform', href: '/#platform' },
  { label: 'Document AI', href: '/#document-ai' },
  { label: 'Route Intelligence', href: '/#route-intelligence' },
  { label: 'How It Works', href: '/#how-it-works' },
]);

export const CAPABILITIES = Object.freeze([
  {
    id: 'document-ai',
    icon: 'FileSearch',
    title: 'Document AI extraction',
    body: 'Upload an invoice, packing list or bill of lading. AI reads the fields and shows where each value was found, so you can review it before it is used.',
    status: 'available',
  },
  {
    id: 'cross-check',
    icon: 'ScanSearch',
    title: 'Deterministic cross-checking',
    body: 'Fixed rules compare weights, values, parties and goods across documents. The same inputs always give the same result, and each finding points to its evidence.',
    status: 'available',
  },
  {
    id: 'routing',
    icon: 'Route',
    title: 'Route intelligence',
    body: 'A* pathfinding compares fastest, cheapest and lowest-risk sea routes between seeded ports. Port data is illustrative.',
    status: 'available',
  },
  {
    id: 'crisis',
    icon: 'ShieldAlert',
    title: 'Crisis rerouting',
    body: 'Rerouting around a port strike is built in the routing core. The screen for it is not in the app yet.',
    status: 'coming soon',
  },
  {
    id: 'security',
    icon: 'Lock',
    title: 'Your data stays yours',
    body: 'Supabase sign-in and row level security keep each account limited to its own shipments and documents.',
    status: 'available',
  },
]);

export const HOW_IT_WORKS = Object.freeze([
  {
    step: 1,
    icon: 'Upload',
    title: 'Upload trade documents',
    body: 'Add the PDFs for a shipment and review what the AI extracted.',
    note: null,
  },
  {
    step: 2,
    icon: 'Scale',
    title: 'Catch weight and value discrepancies',
    body: 'Run the cross-check to list possible inconsistencies that need manual verification.',
    note: null,
  },
  {
    step: 3,
    icon: 'Ship',
    title: 'Reroute around port strikes',
    body: 'Plan another sea route when a port is disrupted.',
    note: 'UI coming soon',
  },
]);

export const FOOTER_COLUMNS = Object.freeze([
  {
    title: 'Product',
    links: [
      { label: 'Platform', href: '/#platform' },
      { label: 'Document AI', href: '/#document-ai' },
      { label: 'Route Intelligence', href: '/#route-intelligence' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Port network', href: '/#network' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log in', href: '/login' },
      { label: 'Register', href: '/register' },
    ],
  },
  {
    title: 'Legal and status',
    links: [
      { label: 'Student project, not a commercial service', href: null },
      { label: 'Demo data is illustrative', href: null },
    ],
  },
]);

export const DISCLAIMERS = Object.freeze({
  sample: 'Sample, illustrative. Made-up demo values, not real shipment data.',
  ports: 'Port positions are illustrative and may differ from real terminals.',
  ai: 'AI Pre-Cleared is an internal label. It does not mean any government or customs approval.',
  footer: 'PortChimera is a student project. Findings need manual verification.',
});
