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
- Confirmed on 2026-09-16: the `shabados/shabados` monorepo README states "Gurbani and Panthic text under `database/collections` follows a separate notice ... public domain, but derogatory alteration of the source text is not", and the 5.0.0-next.0 package README carries the same section as the archived repo.
- **Package facts (read from the npm registry and the extracted tarballs):**
  - `@shabados/database` **5.0.0-next.0**, published 2025-05-05, package licence MIT, `dist/master.sqlite` SHA-256 `517890c7e7c2f3dcef7f21b51d074a581b8eded4ebe14c504b84ea075ff16aeb`. Gurmukhi is **Unicode**; every line names its physical edition (`asset_id`, page, line); 29 Bani compilations, 141,264 lines, 10 sources. **Chosen** (ADR-0006).
  - `@shabados/database` 4.8.7, published 2022-10-15, package licence **GPL-3.0** (code), `build/database.sqlite` SHA-256 `d8e071347bd5485cc6aa2533c1f51347a16ed1724b4d8abaa4939520257074c2`. Gurmukhi is in a **legacy ASCII font encoding**; its `docs/licensing.md` states Gurbani is Public Domain Mark 1.0, while "translations, transliterations, notes, compilations, or other items which are not Gurbani and which are created or uniquely organized by the Shabad OS team are subject to CC BY-SA 4.0", and other authors' supporting texts keep their own copyrights.
- **Nuances the owner should know:** (1) Bani _compilations_ (which lines form Rehras, etc.) may be a Shabad OS work under CC BY-SA 4.0 per the 4.x notice; our structure is bootstrapped from theirs, so attribution is given and any redistribution of our Bani structure should remain share-alike compatible. (2) Translations and notes in the database belong to other authors and are **not** ingested by the adapter. (3) The primary text carries editorial pause marks, which the adapter records as a separate layer (ADR-0006).

## BaniDB (Khalis Foundation)

- Repository: https://github.com/KhalisFoundation/banidb-api (API server, MIT code). Data is served by the API; no dump is published there.
- Terms of Service (https://www.banidb.com/tos/) for data users include, quoted: "You must use BaniDB data in its entirety. You cannot exclude any Gurbani data from the 'Project' without express written permission"; "You must commit to updating the database and widely releasing the update to your users at least once every 90 days"; "You must contribute improvements back to the Service... at least 20 submissions and/or votes per month" or pay a fee; "You must provide written acknowledgement to BaniDB in the Project and include the BaniDB logo"; data is "additionally subject to The Non-Profit Open Software License version 3.0".
- Assessment: **incompatible with adoption.** This project adopts Banis selectively and by verification, may accept readings that differ from BaniDB, and cannot promise 90-day re-releases or a contribution quota. Using BaniDB text as the accepted corpus would breach those terms.
- Options: (a) do not register; (b) register as `redistribution = PROHIBITED` for **comparison only** (reviewers may compare against it; it never reaches the accepted layer or the public API) if the ToS permit that use, which itself needs checking; (c) ask Khalis Foundation for written permission. The owner decides.

## Others named in the requirements

SikhiToTheMax (uses BaniDB data, same terms), iGurbani/iGranth (terms not yet read), printed kharde and scans (evidence sources, transcription only, R-08). To be reviewed when reached.
