import { inflateSync } from 'node:zlib';

/**
 * Best-effort text extraction for simple, text-based PDFs. No dependency.
 * It reads Tj / TJ text operators from (optionally Flate-compressed) streams.
 * Scanned PDFs, fonts with custom encodings and encrypted files give '' and the
 * caller then sends the file itself to the model instead.
 */
export function extractPdfText(buffer) {
  try {
    if (!Buffer.isBuffer(buffer)) return '';
    const latin = buffer.toString('latin1');
    const lines = [];
    let from = 0;
    for (;;) {
      const start = latin.indexOf('stream', from);
      if (start === -1) break;
      // Skip the "endstream" keyword when scanning for the next opener.
      if (latin.startsWith('endstream', start - 3)) {
        from = start + 6;
        continue;
      }
      let dataStart = start + 6;
      if (latin[dataStart] === '\r') dataStart += 1;
      if (latin[dataStart] === '\n') dataStart += 1;
      const end = latin.indexOf('endstream', dataStart);
      if (end === -1) break;
      const dict = latin.slice(Math.max(0, latin.lastIndexOf('<<', start)), start);
      let data = buffer.subarray(dataStart, end);
      if (dict.includes('/FlateDecode')) {
        try {
          data = inflateSync(data);
        } catch {
          from = end + 9;
          continue;
        }
      }
      lines.push(...textFromContent(data.toString('latin1')));
      from = end + 9;
    }
    const text = lines.join('\n').trim();
    return isPlausibleText(text) ? text : '';
  } catch {
    return '';
  }
}

function unescapePdfString(s) {
  return s.replace(/\\([\\()nrtbf]|[0-7]{1,3})/g, (_m, c) => {
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    if (c === 'b' || c === 'f') return '';
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return c;
  });
}

const LITERAL = String.raw`\((?:\\.|[^\\()])*\)`;
const TEXT_OPS = new RegExp(`(${LITERAL})\\s*Tj|\\[((?:\\s*${LITERAL}|[^\\]()])*)\\]\\s*TJ`, 'g');

function textFromContent(content) {
  const out = [];
  for (const m of content.matchAll(TEXT_OPS)) {
    if (m[1] !== undefined) {
      out.push(unescapePdfString(m[1].slice(1, -1)));
    } else {
      const parts = [...m[2].matchAll(new RegExp(LITERAL, 'g'))].map((p) =>
        unescapePdfString(p[0].slice(1, -1)),
      );
      out.push(parts.join(''));
    }
  }
  return out;
}

/** At least 20 characters, mostly printable, so binary noise is not mistaken for text. */
function isPlausibleText(text) {
  if (text.length < 20) return false;
  let printable = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 160) printable += 1;
  }
  return printable / text.length > 0.9;
}

export const MIN_READABLE_CHARS = 20;
const MIN_ALLOWED_SHARE = 0.85;
const MIN_WORD_SHARE = 0.4;

/**
 * Pure check for "is this extracted text real, readable text?". Needs a minimum length, most
 * characters to be letters, digits, spaces or common punctuation, and a fair share to be
 * letters or digits. Gibberish from custom font encodings fails; evidence is then not verifiable.
 */
export function looksReadable(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < MIN_READABLE_CHARS) return false;
  let allowed = 0;
  let wordy = 0;
  for (const ch of trimmed) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      allowed += 1;
      wordy += 1;
    } else if (/[\s.,:;\-/()%&'"@#+_]/.test(ch)) {
      allowed += 1;
    }
  }
  const total = [...trimmed].length;
  return allowed / total >= MIN_ALLOWED_SHARE && wordy / total >= MIN_WORD_SHARE;
}
