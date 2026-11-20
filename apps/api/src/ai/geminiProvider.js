import { AiError } from './aiError.js';
import { buildSystemPrompt, buildUserPrompt } from './prompts/extraction.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Builds the Gemini generateContent request. Pure: no network, no key in the URL or body.
 * The key goes in the x-goog-api-key header, added by the caller. No tools are declared.
 * The file is sent inline only when there is no text.
 */
export function buildRequest({ model, documentType, text, file }) {
  const parts = [{ text: buildUserPrompt({ documentType, text }) }];
  const hasText = typeof text === 'string' && text.trim() !== '';
  if (!hasText && file?.bytes) {
    parts.push({
      inline_data: { mime_type: file.mimeType, data: Buffer.from(file.bytes).toString('base64') },
    });
  }
  return {
    url: `${BASE_URL}/${encodeURIComponent(model)}:generateContent`,
    body: {
      system_instruction: { parts: [{ text: buildSystemPrompt() }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    },
  };
}

/** Turns a Gemini response body into parsed JSON. Rejects anything odd, never repairs it. */
export function parseResponse(body) {
  if (body?.promptFeedback?.blockReason) {
    throw new AiError('bad_output', 'The AI service refused to process this document');
  }
  const candidate = body?.candidates?.[0];
  const text = candidate?.content?.parts?.find((p) => typeof p.text === 'string')?.text;
  if (!text || (candidate.finishReason && candidate.finishReason !== 'STOP')) {
    throw new AiError('bad_output', 'The AI service returned no usable answer');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('bad_output', 'The AI service returned invalid JSON');
  }
}

function isTimeout(err) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError';
}

/**
 * Gemini REST provider. Uses fetch directly, no SDK.
 * Retries once (after a short wait) on timeout, 429 and 5xx. Never retries 400, 401, 403
 * or bad JSON. Error messages never include the API key.
 */
export function createGeminiProvider({
  apiKey,
  model,
  fetchImpl = fetch,
  timeoutMs = 30000,
  sleep = defaultSleep,
  backoffMs = 1000,
}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required');
  if (!model) throw new Error('GEMINI_MODEL is required');

  async function attempt(request) {
    let res;
    try {
      res = await fetchImpl(request.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (isTimeout(err)) throw new AiError('timeout', 'The AI request timed out');
      throw new AiError('upstream', 'Could not reach the AI service');
    }
    if (res.status === 429) throw new AiError('rate_limited', 'The AI service is busy, try later');
    if (res.status === 401 || res.status === 403) {
      throw new AiError('auth', 'The AI service rejected our credentials');
    }
    if (res.status >= 500) throw new AiError('upstream', 'The AI service returned an error');
    if (!res.ok) {
      // 400 and other client errors: our request is wrong, so repeating it will not help.
      const err = new AiError('upstream', 'The AI service rejected the request');
      err.noRetry = true;
      throw err;
    }
    let json;
    try {
      json = await res.json();
    } catch {
      throw new AiError('bad_output', 'The AI service returned invalid JSON');
    }
    return parseResponse(json);
  }

  return {
    async extractDocument({ documentType, text, file }) {
      const request = buildRequest({ model, documentType, text, file });
      let raw;
      try {
        raw = await attempt(request);
      } catch (err) {
        const retryable = ['timeout', 'rate_limited', 'upstream'].includes(err?.kind);
        if (!retryable || err.noRetry) throw err;
        await sleep(backoffMs);
        raw = await attempt(request);
      }
      return { raw, model };
    },
  };
}
