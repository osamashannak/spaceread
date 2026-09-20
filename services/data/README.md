# Faculty imports

`zayed_faculty.json` is a reviewed snapshot of public Zayed University faculty names,
published `@zu.ac.ae` email addresses, colleges, and official source URLs. Its
coverage and exclusions document what was verified; it is not a fabricated list
or a guarantee that every faculty member has a public profile.

Run from `services/` with the intended database's `DB_*` environment variables.
The importer never automatically loads `.env`; an explicit `--env-file` loads a
chosen file without overriding variables already set in the environment.

```powershell
go run ./cmd/import-professors --file ./data/zayed_faculty.json --env-file ./.env --report ./zayed-dry-run.json
go run ./cmd/import-professors --file ./data/zayed_faculty.json --env-file ./.env --apply --report ./zayed-import.json
```

The first command is read-only. Review the target database and dry-run report
before applying. Reports contain the source file's SHA-256, counts, new and
existing faculty, conflicts, and the exact emails committed by this invocation.
Omit `--report` to print JSON to stdout. An insert failure rolls back the batch.
If the COMMIT response is lost, `commit_status` is `unknown` and
`needs_reconciliation` is true: `applied=false` and zero confirmed inserts do not
prove rollback. Check every `attempted_emails` entry against the database before
retrying. `inserted_emails` contains only inserts with a confirmed commit. Report files should be retained with
the source manifest as the import audit record, not committed with deployment
credentials or operational database details.

The importer accepts only this manifest's canonical `Zayed University` identity,
UTC retrieval timestamp, non-empty names/colleges, published institutional emails,
and HTTPS sources under `zu.ac.ae`. It lowercases emails, sorts and deduplicates
colleges, and joins multiple college names with `; `. Source and coverage metadata
remain in the manifest/report; no schema change is required.

Existing records are never updated or removed. Matching records are skipped;
conflicting emails, changed names/colleges/universities, and same-name/different-email
identities are reported for review and skipped. Distinct people with the same name
must be resolved manually from source evidence. Other valid new records can still
be imported. This preserves reviews, visibility, views, aliases, and moderation.
During apply, a short table write lock protects the case-insensitive duplicate
check because the database email primary key itself is case-sensitive. Lock
acquisition times out after 15 seconds; the whole command times out after 5 minutes.

Import before enabling the new selector in production. Restart every professor
API instance afterward: university lists, including empty lists, are cached in
memory for 12 hours. Verify the Zayed University list and a representative profile.
This command does not deploy or restart services and is not an automatic sync.

Tests:

```powershell
go test ./cmd/import-professors
# Optional PostgreSQL tests: the role needs CREATEDB.
$env:TEST_DATABASE_URL = 'postgres://testuser:testpassword@localhost:5432/postgres?sslmode=disable'
go test ./cmd/import-professors -v
```

Database tests create and remove uniquely named disposable databases and never
modify the database named in `TEST_DATABASE_URL`. They verify dry runs, idempotency,
case-insensitive identity checks, preservation of existing data, and atomic failure.


## Collecting the public snapshot

The collector uses Python's standard library and does not connect to a database.
Run from `services/`:

```powershell
python scripts/collect_zayed_faculty.py --transport curl --output data/zayed_faculty.json --refresh
python -m unittest discover -s scripts -p 'test_collect_zayed_faculty.py' -v
```

`--transport curl` uses the installed system curl for HTTPS; omit it to use Python's
HTTPS client. Public HTML is cached for up to 24 hours in the system temporary
directory (`spaceread-zayed-faculty`), outside this repository. Omit `--refresh` to
reuse that cache while reviewing extraction changes. Default concurrency is six.
Review the generated manifest and import dry run after every collection.

Membership comes from the seven active college faculty directories linked by ZU's
college menus, including their 17 campus/department child directories. Academic
administrators with teaching ranks, faculty, instructors and adjuncts are included
across Abu Dhabi and Dubai. Stale copied directories under `_profiles/index` and
`_links/index` are not membership sources. The CTI contact page supplies 15 explicit
name/email mappings as secondary evidence, restricted to current directory members.
Current directory display names take precedence over profile titles. Visible email
fields take precedence over stale `mailto:` targets found in some official pages.
No contact-form identifier or name pattern is converted into an email address.

Faculty are deduplicated by lowercase email; verified cross-college affiliations
and all source URLs are retained. Exact-name matches to another verified official
profile can reconcile a broken or email-free duplicate profile; these are listed
in `reconciled_profiles`. `name_variants` preserves observed directory spellings.
Unrelated names sharing an email abort collection for review. Any failed or empty
required directory aborts collection instead of writing a partial snapshot.

The manifest's `coverage` and `supplemental_coverage` record fetched directories and
entry counts. `exclusions` records source entries, not necessarily unique people:

- `non_teaching_staff`: administrative or technical staff without a teaching role.
- `missing_published_email`: a profile exists but does not publish a usable institutional email, including contact-form-only profiles.
- `profile_unavailable`: request failure or an official page-not-found template.
- `ambiguous_published_email`: multiple published addresses require manual review.
- `academic_administrator_without_verified_teaching_rank`: no teaching rank could be verified from the listing or profile.

The source has incomplete profiles and contact-only forms, so the snapshot does
not include every listed faculty member. These omissions are explicit rather than
filled with guessed contact information. No automatic synchronization is scheduled.
