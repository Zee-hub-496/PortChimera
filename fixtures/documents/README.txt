All files in this folder are SYNTHETIC test fixtures.
Companies, people, numbers and values are invented. Nothing here is a real document.
Regenerate with: node scripts/generate-document-fixtures.mjs

fake-invoice.pdf is not a PDF. It holds EXE-style bytes ("MZ") to test that uploads are
rejected by their real content and not by their file name.
demo-invoice.pdf, demo-packing-list.pdf and demo-certificate-of-origin.pdf are the cross-check demo set.
They agree on everything except the gross weight: 500 kg on the invoice, 650 kg on the packing list.
injection-invoice.pdf contains a prompt-injection sentence on purpose.
