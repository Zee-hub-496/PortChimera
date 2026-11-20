import { motion } from 'framer-motion';
import {
  ArrowRight,
  FileSearch,
  Lock,
  Route,
  Scale,
  Search,
  Ship,
  ShieldAlert,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import MaritimeMapLazy from '../components/MaritimeMapLazy.jsx';
import { Badge, Card, LinkButton } from '../components/ui.jsx';
import { SAMPLE_PORTS, SAMPLE_SHIPMENT } from '../lib/samplePorts.js';
import { CAPABILITIES, DISCLAIMERS, HOW_IT_WORKS } from '../lib/siteContent.js';

const ICONS = { FileSearch, Search, Route, ShieldAlert, Lock, Upload, Scale, Ship };

// Fades content in once when it scrolls into view. MotionConfig in main.jsx handles reduced motion.
function Reveal({ children, delay = 0, className = '' }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title, children }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-fg">{title}</h2>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <Badge tone={status === 'available' ? 'success' : 'warn'}>
      {status === 'available' ? 'Available' : 'UI coming soon'}
    </Badge>
  );
}

function Hero({ signedIn }) {
  const { origin, destination, discrepancy } = SAMPLE_SHIPMENT;
  const route = [origin, destination];
  return (
    <section className="bg-grid relative overflow-hidden">
      <div className="bg-glow absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <Badge tone="info">Student project</Badge>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-fg sm:text-5xl">
            Cross-check trade documents. Plan the sea route.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            PortChimera reads invoices, packing lists and bills of lading with AI, then compares
            them with fixed rules so possible inconsistencies show up before cargo ships. It also
            compares sea routes between ports with A* pathfinding.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {signedIn ? (
              <LinkButton to="/dashboard" className="px-5 py-2.5">
                Go to dashboard <ArrowRight size={16} aria-hidden="true" />
              </LinkButton>
            ) : (
              <LinkButton to="/register" className="px-5 py-2.5">
                Get Started <ArrowRight size={16} aria-hidden="true" />
              </LinkButton>
            )}
            <LinkButton to="/#how-it-works" variant="secondary" className="px-5 py-2.5">
              See how it works
            </LinkButton>
          </div>
        </div>

        <Reveal>
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-sm font-bold text-fg">{SAMPLE_SHIPMENT.number}</p>
                <p className="text-sm text-muted">
                  {origin.name} to {destination.name}
                </p>
              </div>
              <Badge tone="warn">{SAMPLE_SHIPMENT.label}</Badge>
            </div>
            <MaritimeMapLazy
              ports={route}
              route={route}
              highlightCodes={[origin.code, destination.code]}
              height={220}
              interactive={false}
              fit="route"
              ariaLabel={`Sample route from ${origin.name} to ${destination.name}`}
            />
            <div className="mt-3 flex gap-3 rounded-lg border border-line bg-warn-soft p-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-bold text-fg">{discrepancy.field} differs between documents</p>
                <p className="mt-0.5 text-fg">
                  <span className="font-mono">{discrepancy.a}</span> on one document,{' '}
                  <span className="font-mono">{discrepancy.b}</span> on another. Possible
                  inconsistency, requires manual verification.
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{DISCLAIMERS.sample}</p>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

function Capabilities() {
  const cards = CAPABILITIES.filter((c) => c.id !== 'routing');
  return (
    <section id="platform" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20">
      <SectionHeading eyebrow="Platform" title="What PortChimera does">
        Each capability is labelled with what is built today.
      </SectionHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c, i) => {
          const Icon = ICONS[c.icon] ?? FileSearch;
          return (
            <Reveal key={c.id} delay={i * 0.06}>
              <Card className="h-full p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-lg bg-accent-soft p-2.5 text-accent">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <StatusBadge status={c.status} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-fg">{c.title}</h3>
                <p className="mt-2 text-sm text-muted">{c.body}</p>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

function DocumentAiBand() {
  return (
    <section id="document-ai" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Document AI</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-fg">
            See where every value came from
          </h2>
          <p className="mt-3 text-muted">
            The AI never fills in a value it cannot find. Each extracted field has a confidence
            level and points to the text it was read from. Missing fields stay empty so you can
            decide what to do.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-fg">
            <li>Invoices, packing lists and bills of lading</li>
            <li>Review each field before it is used</li>
            <li>Same file, same result: extractions are cached</li>
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <Card className="bg-surface-2 p-5" aria-label="Illustration of an extracted document">
            <div className="rounded-lg border border-line bg-surface p-4">
              <div className="skeleton mb-3 h-3 w-1/3 rounded" aria-hidden="true" />
              <div className="space-y-2" aria-hidden="true">
                <div className="skeleton h-2 w-full rounded" />
                <div className="skeleton h-2 w-5/6 rounded" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md bg-accent-soft p-2 text-sm">
                <span className="text-muted">Gross weight</span>
                <span className="font-mono font-bold text-fg">650 kg</span>
                <Badge tone="success">Found in document</Badge>
                <Badge tone="info">High confidence</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2 text-sm">
                <span className="text-muted">Insurance value</span>
                <span className="font-mono text-muted">not found</span>
                <Badge tone="neutral">Missing</Badge>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">Illustration with made-up values.</p>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

const OPTIONS = [
  { label: 'Fastest', width: '58%', tone: 'bg-accent' },
  { label: 'Cheapest', width: '78%', tone: 'bg-info' },
  { label: 'Lowest risk', width: '90%', tone: 'bg-success' },
];

function RouteIntelligenceBand() {
  return (
    <section id="route-intelligence" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal className="lg:order-2">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">
            Route intelligence
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-fg">
            Compare sea routes between ports
          </h2>
          <p className="mt-3 text-muted">
            A* pathfinding searches a graph of seeded ports and shipping lanes. It returns the
            fastest, cheapest and lowest-risk options so you can compare the trade-offs. Rerouting
            around a port strike is built in the routing core. Its screen is coming soon.
          </p>
          <div className="mt-4">
            <Badge tone="warn">Crisis rerouting UI coming soon</Badge>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="lg:order-1">
          <Card className="p-5" aria-label="Illustration of three route options">
            <div className="space-y-4">
              {OPTIONS.map((o) => (
                <div key={o.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-semibold text-fg">{o.label}</span>
                    <span className="text-muted">Option</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-surface-2">
                    <motion.div
                      className={`h-2.5 rounded-full ${o.tone}`}
                      initial={{ width: 0 }}
                      whileInView={{ width: o.width }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              Illustration only. The bars carry no real distances or costs.
            </p>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading eyebrow="How it works" title="From documents to decisions" />
        <div className="relative grid gap-8 md:grid-cols-3">
          <motion.div
            aria-hidden="true"
            className="absolute left-[16%] right-[16%] top-6 hidden h-0.5 origin-left bg-line md:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.2 }}
          />
          {HOW_IT_WORKS.map((s, i) => {
            const Icon = ICONS[s.icon] ?? Upload;
            return (
              <Reveal key={s.step} delay={i * 0.15} className="relative text-center">
                <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-fg">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <p className="mt-3 font-mono text-xs text-muted">Step {s.step}</p>
                <h3 className="mt-1 text-lg font-bold text-fg">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.body}</p>
                {s.note && (
                  <div className="mt-2">
                    <Badge tone="warn">{s.note}</Badge>
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Network() {
  return (
    <section id="network" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20">
      <SectionHeading eyebrow="Port network" title="A sample of the port network">
        Select a port pin to see its name and UN/LOCODE.
      </SectionHeading>
      <MaritimeMapLazy
        ports={SAMPLE_PORTS}
        height={420}
        interactive
        fit="world"
        ariaLabel="World map with five sample ports"
      />
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Legend">
        {SAMPLE_PORTS.map((p) => (
          <li key={p.code}>
            <Badge tone="neutral">
              {p.name} <span className="font-mono">{p.code}</span>
            </Badge>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{DISCLAIMERS.ports}</p>
    </section>
  );
}

function ClosingCta({ signedIn }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20">
      <div className="rounded-2xl bg-brand px-6 py-12 text-center text-brand-fg">
        <h2 className="text-3xl font-extrabold tracking-tight">Try it on a sample shipment</h2>
        <p className="mx-auto mt-3 max-w-xl opacity-80">
          Create an account, add a shipment and upload a document to see the cross-check.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {signedIn ? (
            <LinkButton to="/dashboard" variant="secondary">
              Go to dashboard
            </LinkButton>
          ) : (
            <>
              <LinkButton to="/register" variant="secondary">
                Get Started
              </LinkButton>
              <LinkButton
                to="/login"
                className="border border-brand-fg/40 bg-transparent text-brand-fg"
              >
                Log In
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { session } = useAuth();
  const signedIn = Boolean(session);
  return (
    <>
      <Hero signedIn={signedIn} />
      <Capabilities />
      <DocumentAiBand />
      <RouteIntelligenceBand />
      <HowItWorks />
      <Network />
      <ClosingCta signedIn={signedIn} />
    </>
  );
}
