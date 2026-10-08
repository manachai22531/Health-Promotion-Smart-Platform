# React + TypeScript preparation

This directory reserves the future frontend workspace. The current `app.html`
and assets remain the production UI and are not bundled or rewritten in phase 1.

Planned structure:

```text
frontend/
  src/
    api/          REST clients generated from stable backend contracts
    components/   reusable UI pieces
    features/     patient, worklist, package, booking, project and admin screens
    types/        frontend-safe API DTOs
```

React tooling should be introduced only after characterization tests cover the
existing REST response shapes. During migration, the legacy page and React app
can coexist behind separate entry paths until each feature reaches parity.
