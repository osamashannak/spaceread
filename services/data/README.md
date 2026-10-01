# Faculty snapshots

`zayed_faculty.json` is a reviewed snapshot of public Zayed University faculty names,
published `@zu.ac.ae` email addresses, colleges, and official source URLs. Its
coverage and exclusions document what was verified; it is not a fabricated list
or a guarantee that every faculty member has a public profile.

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
Review the generated manifest after every collection.

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
