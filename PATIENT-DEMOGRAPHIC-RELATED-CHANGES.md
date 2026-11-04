# Patient Demographic: related patient data

Source relationships: `public.patient.id = public.patientdetail.patientid` and `public.patient.id = public.patientothername.patientid`.

- Discover the actual child-table columns and return every column for active (not soft-deleted) matching rows. Children are batched by the matched patient IDs; they do not multiply the main patient search results. Long integer/numeric values are returned losslessly as text.
- A result has a read-only additional-data dialog with all patientdetail and patientothername rows/fields. Matched English names appear on the main result.
- English names are classified using explicit code/name labels from `lov` linked by `patientothername.lovptothnameid`. Numeric type IDs such as 4546/4544 are not assumed to mean English. Unknown types and multiple distinct English name pairs are reported for review, with all original other-name rows retained. Existing patient English name fields are not mixed with a different alias.
- Passport search also checks active patientdetail rows, and name search checks active patientothername first/last pairs through EXISTS. Name-only results still require explicit manual patient selection. Input DOB/gender restrictions remain applied.
- Excel appends every child field to the existing Patient Demographic row, using columns such as patientdetail_1_email and patientothername_2_firstname. Multiple child rows use numbered column groups; the patient row is not multiplied. The existing reviewed-results sheet receives the same extended columns. No separate patientdetail/patientothername sheets are generated.
- The existing dataCenterView/customerSensitiveView guards and read-only HIS connection remain required. The HIS account needs SELECT on the two child tables and lov to resolve name types; missing/unreadable child data produces explicit warnings.

Validation: unit tests, a disposable PostgreSQL database test with fake patients (large IDs, multiple children, deleted rows, aliases, English ambiguity and HTTP result metadata), a Chromium test that downloads and reads the real exported workbook, build and release checks. No uploaded patient sample values were used as test fixtures or copied into source files.

The real hospital HIS has not been queried from this environment. This change is source only; no new installer, version bump or Git push was requested.
