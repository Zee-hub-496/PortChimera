import ShipmentHubList from '../components/ShipmentHubList.jsx';
import { PageHeader } from '../components/ui.jsx';

export default function DocumentsHub() {
  return (
    <div>
      <PageHeader
        title="Documents"
        description="Documents belong to a shipment. This page is a shortcut: choose a shipment to upload, read and approve its documents."
      />
      <ShipmentHubList tab="documents" linkLabel="Open documents" />
    </div>
  );
}
