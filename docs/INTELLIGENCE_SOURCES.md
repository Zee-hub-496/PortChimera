# Maritime intelligence data sources

Checked on 2026-11-28 by web search only. The agent sandbox cannot call these services, so **no response below has been fetched live**. Each item says what was found and what still has to be verified from the owner's machine or from Render. Content here is paraphrased from the cited pages.

## GDELT DOC 2.0 (news discovery)

- Free, no API key. Endpoint `https://api.gdeltproject.org/api/v2/doc/doc`. Article list mode returns JSON with an `articles` array. Sources: [GDELT DOC 2.0 introduction](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/), [a third-party summary of verified parameters](https://apify.com/vhsgreed/news-monitor-gdelt-fresh), [a client library README](https://github.com/alex9smith/gdelt-doc-api/blob/main/README.md).
- Parameters to use: `query`, `mode=ArtList`, `format=json`, `sort=DateDesc`, `maxrecords`, `timespan`. One third-party page reports a cap of 75 records per request and another mentions 250; we use **at most 75** to be safe.
- Article fields reported: `url`, `title`, `seendate`, `domain`, `language`, `sourcecountry`, `socialimage`. There is **no summary field**, so the event summary stays empty and the interface says "no summary provided by the source". Any AI summary must be labeled as AI-generated and is never shown as official.
- The search window covers about the most recent three months.
- Not yet verified live: rate limits (none documented that we found; keep the 15-minute cache and one request per topic), the exact `seendate` format (expected `YYYYMMDDTHHMMSSZ`, the parser also rejects anything else), and occasional non-JSON error bodies (the client must treat them as a failure).

## UKMTO (official maritime security reports)

- The site publishes recent incidents as a web page at https://www.ukmto.org/recent-incidents. We found **no official RSS feed or API**; a third-party feed builder says the same ([Feeder](https://feeder.co/discover/74a4414022/ukmto-org-recent-incidents)).
- Decision: **do not scrape**. World Monitor shows UKMTO as a linked official source panel. A UKMTO page can still appear as an `OFFICIAL_SOURCE` event when GDELT returns an article on `ukmto.org`.
- To check later: whether UKMTO publishes machine-readable data on request or a documented endpoint.

## MARAD U.S. Maritime Advisories

- Advisories are on https://www.maritime.dot.gov/msci-advisories and alerts on https://www.maritime.dot.gov/msci-alerts. Distribution is by email subscription ([subscription page](https://www.maritime.dot.gov/msci/us-maritime-alerts-and-advisories-subscriptions)). We found **no JSON API**. They are U.S. government products published through MARAD ([MARAD overview](https://www.maritime.dot.gov/msci/2019-009-global-overview-us-maritime-advisory-system)).
- Decision: same as UKMTO. Linked official panel, no scraping.
- To check later: whether the advisories page exposes an RSS link in its HTML head.

## IMO

- https://www.imo.org/ is on the official-domain list for classification only. No feed integration is planned.

## EIA Open Data (Brent crude)

- API v2. Brent spot is series `RBRTE` under route `petroleum/pri/spt`; request `https://api.eia.gov/v2/petroleum/pri/spt/data/` with `frequency=daily`, `data[]=value`, `facets[series][]=RBRTE`, sorted by period descending, plus `api_key`. A v1 id such as `PET.RBRTE.D` is reported to resolve at `/v2/seriesid/PET.RBRTE.D`. Sources: [EIA API documentation](https://www.eia.gov/opendata/documentation.php), [a worked example](https://www.oilpriceapi.com/blog/eia-api-python), [EIA Brent table](https://eia.gov/dnav/pet/hist/rbrteD.htm).
- Rows are reported with `period` (date), `series`, `value` (a string) and `units`. The parser accepts strings and numbers and drops anything else.
- Needs a free key from https://www.eia.gov/opendata/, stored only as `EIA_API_KEY` on Render.
- Not yet verified live: the exact response envelope and the daily-data delay. The first live call must be made with the real key from Render or the owner's machine, and this file updated with what came back.

## What this means for the product

- The only fully automatic news source is GDELT, so every automatic event is a `MEDIA_REPORT` unless its link is on an official domain.
- Official sources are shown as links the user can open. The interface must not suggest UKMTO or MARAD data is being read in real time.
- Because GDELT titles are untrusted text, they are stored and displayed as plain text and never passed to a model as instructions.
