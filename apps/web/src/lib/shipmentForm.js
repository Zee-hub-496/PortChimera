// Pure validation for the "new shipment" form. Returns { valid, errors, value }.
// The API validates again; this only gives quick feedback.
export const INCOTERMS = [
  'EXW',
  'FCA',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
];

export function validateShipmentForm(input) {
  const errors = {};
  const shipmentNumber = String(input?.shipmentNumber ?? '').trim();
  const originPortCode = String(input?.originPortCode ?? '').trim();
  const destinationPortCode = String(input?.destinationPortCode ?? '').trim();
  const incoterm = String(input?.incoterm ?? '').trim();

  if (!shipmentNumber) errors.shipmentNumber = 'Enter a shipment number.';
  else if (shipmentNumber.length > 64) errors.shipmentNumber = 'Use 64 characters or fewer.';
  if (!originPortCode) errors.originPortCode = 'Choose an origin port.';
  if (!destinationPortCode) errors.destinationPortCode = 'Choose a destination port.';
  if (originPortCode && destinationPortCode && originPortCode === destinationPortCode) {
    errors.destinationPortCode = 'Origin and destination must be different.';
  }
  if (incoterm && !INCOTERMS.includes(incoterm)) errors.incoterm = 'Choose a listed Incoterm.';

  const value = { shipmentNumber, originPortCode, destinationPortCode };
  if (incoterm) value.incoterm = incoterm;
  return { valid: Object.keys(errors).length === 0, errors, value };
}
