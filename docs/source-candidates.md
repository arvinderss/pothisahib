# External source candidates: licence review

Read on 2026-09-16 from the pages cited. **Nothing has been registered or ingested.** The project owner
decides which source is registered first; the database will refuse adoption from any source whose
redistribution status is not ALLOWED or ATTRIBUTION_REQUIRED.

## Shabad OS database

- Repository: https://github.com/shabados/database (archived 2026-09-09; development moved to the `shabados/shabados` monorepo). Distributed as the npm package `@shabados/database` (SQLite build).
- Code: MIT ("The code under this project falls under the MIT License"), which the README says "applies to code and content resting outside of the `data` folder".
- Data folder: marked public domain (Creative Commons Public Domain Mark 1.0, linked from the README).
- Data: the README states most Gurbani and Panthic texts "are free of known copyright restrictions. We identify it as being in the public domain as a work of factual compilation with originality", and asks that "derogatory treatments (including adding to, deleting from, altering of, or adapting) the words in a way that distorts or mutilates the original work is forbidden."
- Assessment: compatible with this project. Our source layer preserves their text byte-exactly and our accepted layer changes only by evidenced human decisions, which is the opposite of derogatory treatment; the same request appears in our own stewardship statement.
- **Recommended registry values:** `source_type = DATABASE`, `license = "Public domain (data, per README); MIT (code)"`, `license_url = <README URL>`, `redistribution = ATTRIBUTION_REQUIRED` (attribution is not legally required for public-domain data; we choose to attribute), `attribution_text = "Text adopted from the Shabad OS database (shabados.com), public domain."`, `import_method = "@shabados/database npm package (SQLite) → kosh-source/1 adapter"`.
- Open point: confirm the monorepo carries the same data-licence statement before the first ingest (the archived repo's statement is what was read).

## BaniDB (Khalis Foundation)

- Repository: https://github.com/KhalisFoundation/banidb-api (API server, MIT code). Data is served by the API; no dump is published there.
- Terms of Service (https://www.banidb.com/tos/) for data users include, quoted: "You must use BaniDB data in its entirety. You cannot exclude any Gurbani data from the 'Project' without express written permission"; "You must commit to updating the database and widely releasing the update to your users at least once every 90 days"; "You must contribute improvements back to the Service... at least 20 submissions and/or votes per month" or pay a fee; "You must provide written acknowledgement to BaniDB in the Project and include the BaniDB logo"; data is "additionally subject to The Non-Profit Open Software License version 3.0".
- Assessment: **incompatible with adoption.** This project adopts Banis selectively and by verification, may accept readings that differ from BaniDB, and cannot promise 90-day re-releases or a contribution quota. Using BaniDB text as the accepted corpus would breach those terms.
- Options: (a) do not register; (b) register as `redistribution = PROHIBITED` for **comparison only** (reviewers may compare against it; it never reaches the accepted layer or the public API) if the ToS permit that use, which itself needs checking; (c) ask Khalis Foundation for written permission. The owner decides.

## Others named in the requirements

SikhiToTheMax (uses BaniDB data, same terms), iGurbani/iGranth (terms not yet read), printed kharde and scans (evidence sources, transcription only, R-08). To be reviewed when reached.
