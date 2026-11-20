import ShipmentHubList from '../components/ShipmentHubList.jsx';
import { PageHeader } from '../components/ui.jsx';
import { DISCLAIMER } from '../lib/crosscheckView.js';

export default function AlertsHub() {
  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Possible inconsistencies are found per shipment. This page is a shortcut: choose a shipment to open its cross-check."
      />
      <p className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">{DISCLAIMER}</p>
      <ShipmentHubList tab="cross-check" linkLabel="Open cross-check" />
    </div>
  );
}
