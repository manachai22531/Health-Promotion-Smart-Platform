# Incremental TypeScript migration

## Phase 1 (current)

- Compile the existing CommonJS backend together with new TypeScript modules.
- Keep `npm start` and every REST route/database query unchanged.
- Establish shared domain contracts for Patient, Visit, EMR, Package, Booking,
  Project, User, Role and Permission.
- Add a typed HIS API transport ready to replace inline HTTP calls route by route.
- Provide a TypeScript entrypoint through `npm run start:ts` after `npm run build`.

## Next phases

1. ~~Move pure HIS payload normalization and visit selection helpers into TypeScript.~~
   Completed with a runtime fallback to the legacy helpers.
2. ~~Inject the typed transport into GET_VISIT and GET_EMR_RESULT handlers.~~
   Completed through `callConfiguredHisJson`, with the legacy transport retained
   as a pre-build fallback and integration coverage for GET/POST/DELETE/errors.
3. Express route extraction started: Visit, EMR and combined checkup-result now
   register from TypeScript after build, with legacy route fallback unchanged.
4. PostgreSQL repository migration started with the active HIS connection query;
   the shared JSON state read/write transaction is now typed as well. SQL,
   revision behavior and relational synchronization remain unchanged.
   Project lookup and individual/bulk Booking inserts are also available through
   the typed workflow repository with their original SQL contracts.
5. Introduce a separate React + TypeScript frontend workspace only after backend
   route contracts and smoke tests are stable.
