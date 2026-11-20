import { Suspense, lazy } from 'react';

// maplibre-gl is large, so it loads only on pages that show a map.
const MaritimeMap = lazy(() => import('./MaritimeMap.jsx'));

/** Same props as MaritimeMap. Shows a skeleton while the map code loads. */
export default function MaritimeMapLazy(props) {
  const { height = 360, className = '' } = props;
  return (
    <Suspense
      fallback={
        <div className={className}>
          <div aria-hidden="true" className="skeleton w-full rounded-xl" style={{ height }} />
        </div>
      }
    >
      <MaritimeMap {...props} />
    </Suspense>
  );
}
