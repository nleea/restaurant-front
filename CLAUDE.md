# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Plan Node Default 
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions) 
- If something goes sideways, STOP and re-plan immediately 
- don't keep pushing - Use plan mode for verification steps, not just building 
- Write detailed specs upfront to reduce ambiguity 
--- 
### 2. Subagent Strategy 
- Use subagents liberally to keep main context window clean 
- Offload research, exploration, and parallel analysis to subagents 
- For complex problems, throw more compute at it via subagents 
- One task per subagent for focused execution 
--- 
### 3. Self-Improvement Loop 
- After ANY correction from the user: update `tasks/lessons.md` with the pattern 
- Write rules for yourself that prevent the same mistake 
- Ruthlessly iterate on these lessons until mistake rate drops 
- Review lessons at session start for relevant project 
--- 
### 4. Verification Before Done 
- Never mark a task complete without proving it works 
- Diff behavior between main and your changes when relevant 
- Ask yourself: "Would a staff engineer approve this?" 
- Run tests, check logs, demonstrate correctness 
--- 
### 5. Demand Elegance (Balanced) 
- For non-trivial changes: pause and ask "is there a more elegant way?" 
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution" 
- Skip this for simple, obvious fixes 
- don't over-engineer 
- Challenge your own work before presenting it 
--- 
### 6. Autonomous Bug Fixing 
- When given a bug report: just fix it. Don't ask for hand-holding 
- Point at logs, errors, failing tests 
- then resolve them 
- Zero context switching required from the user 
- Go fix failing CI tests without being told how 
--- 
## Task Management 
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items 
2. **Verify Plan**: Check in before starting implementation 
3. **Track Progress**: Mark items complete as you go 
4. **Explain Changes**: High-level summary at each step 
5. **Document Results**: Add review section to `tasks/todo.md` 
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections 
---
 ## Core Principles 
- **Simplicity First**: Make every change as simple as possible. Impact minimal code 
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards

## Status: foundation layer in place

Scaffolded with **Vite + Vue 3 (Composition API, `<script setup>`) + TypeScript**, package
manager **pnpm**. Stack: **PrimeVue** (components, Aura preset) + **Tailwind CSS v4**
(layout/utilities) + **Axios** (single instance) + **Pinia** + **Vue Router**.

The foundation layer (HTTP client, auth, RBAC routing) lives under `src/`:
- `src/lib/tokens.ts` — token storage leaf (localStorage), breaks the `axios ↔ store` cycle.
- `src/lib/http.ts` — the single Axios instance; `baseURL` derived from the Host subdomain;
  request interceptor attaches `Bearer`; response interceptor does single-flight 401 refresh.
- `src/stores/auth.ts` — Pinia store: `login`, `logout`, `fetchMe`, `bootstrap`, `can(code)`.
- `src/router/index.ts` — guards by `meta.requiresAuth` and `meta.permission` (UX only).

**Visual identity ("El Pase").** Design tokens live in `src/assets/main.css` via Tailwind v4
`@theme` (graphite/steel base, single heat-lamp `ember` accent, `paper`/`app` surfaces; fonts:
Bricolage Grotesque display, IBM Plex Sans body, IBM Plex Mono for figures/codes). PrimeVue's
primary is remapped to `ember` in `main.ts` so components inherit the accent. Narrative: the
login is the dark "pass" under the heat lamp; the authenticated app is the light working
surface. Use the token utilities (`bg-app`, `text-ember`, `font-display`, …), not raw hexes.

**Dense screens are mobile-first master–detail.** The RBAC screen (`views/RbacView.vue`,
`components/rbac/*`) is the reference pattern: on `< lg` a list fills the screen and tapping a
row drills into a full-screen detail with a back affordance; on `>= lg` both panes show at once
and selection updates the detail in place — driven by one `selected` ref + `max-lg:hidden`
classes, no router sub-routes. Permission modules are framed as restaurant *stations*
(`lib/stations.ts` maps `cash→Caja`, `kitchen→Cocina`, …); the editor's signature is a
collapsible station row with a granted/total count and an ember fill bar. Note: PrimeIcons
`.pi` sets `display: inline-block !important`, so put responsive `hidden`/`lg:hidden` on a
wrapping `<span>`, never on the `.pi` element itself.

Commands (run from `front/`): `pnpm dev` (serves at `http://demo.localhost:5173`),
`pnpm build`, `pnpm test:unit`, `pnpm test:e2e`, `pnpm lint`, `pnpm format`,
`pnpm type-check`. The dev server accepts any `*.localhost` host so the tenant subdomain
resolves; point the browser at `http://<slug>.localhost:5173` (e.g. `demo.localhost`).

This is the **client for an already-built backend**. The backend lives in the sibling
directory `../backend` (FastAPI + SQLAlchemy 2.0 async + PostgreSQL). Almost everything
worth knowing here is the *integration contract* below — read `../backend/CLAUDE.md`,
`../docs/`, and `../docs/Primer Alcance.md` for the product and domain.

## What the product is

Multi-tenant SaaS for **restaurant management**, oriented more toward back-office
(purchasing, costing, finance) than pure POS. Market references: Toast, Square, Loyverse.
Target market is Colombia (expect Nequi/Daviplata payments, eventual DIAN fiscal needs).
The bar for "indispensable" is that **3 real pilot restaurants** can run daily operations
without falling back to Excel or paper.

## Backend integration contract (the load-bearing knowledge)

Run the API locally with `cd ../backend && poetry run uvicorn restaurante.main:app --reload`
(serves on `http://localhost:8000`). Seed data: `poetry run python -m scripts.seed` creates
tenant slug `demo` with `admin@demo.com` / `admin1234`. `GET /health` is the liveness check.

### Tenancy is resolved by subdomain — not a header you set in JSON

Every request's tenant is derived from the **Host subdomain**: `<slug>.<BASE_DOMAIN>`, where
`BASE_DOMAIN=localhost` in dev. `*.localhost` resolves to `127.0.0.1` in the browser without
touching `/etc/hosts`. So the frontend must call the API at the **tenant subdomain host**,
e.g. `http://demo.localhost:8000/...`, and ideally run the dev server at `demo.localhost`
too. There is no `tenant_id` field in request bodies — getting the host wrong means the wrong
(or no) tenant. This is the single most common integration mistake.

### Auth flow (JWT access + refresh)

- `POST /auth/login` `{email, password}` → `{access_token, refresh_token, token_type}`.
  Tenant comes from the subdomain; login is otherwise public. Errors are intentionally
  generic (don't leak whether the email exists).
- `POST /auth/refresh` `{refresh_token}` → new token pair. Access tokens expire in
  **15 min**, refresh in **7 days** — implement transparent refresh on 401.
- `GET /auth/me` (Bearer access token) → `{id, email, name, permissions: string[]}`.
- Send the access token as `Authorization: Bearer <token>`. **The JWT does not carry
  permissions** — they are resolved server-side per request and returned by `/auth/me`.

### RBAC: gate the UI by permission codes

Authorization is dynamic: effective permissions = `(roles' permissions ∪ allow overrides) −
deny overrides`, cached server-side. Permission codes are `"<module>.<action>"` —
e.g. `menu.read`, `menu.manage`, `inventory.read`, `staff.manage`, `rbac.manage`. Fetch the
current user's `permissions` from `/auth/me` and use them to show/hide UI and guard routes;
the backend independently enforces them, so the frontend gate is UX, not security. The
`/rbac/*` endpoints (manage roles, role↔permission, user↔role, per-user overrides) all
require `rbac.manage` and mostly return `204 No Content`.

### API module map (router prefixes mounted in `../backend/.../main.py`)

`/auth`, `/rbac`, `/menu`, `/staff`, `/inventory`, `/recipes`, `/orders`, `/cash`,
`/kitchen`, `/delivery`, `/purchasing`, `/customers`, `/finance`, `/catalog`, `/audit`.
Each module is documented under `../docs/<module>/` (README + one file per table with
endpoints, fields, and examples). All backend modules have a functional API today except
`messaging` (notifications/WhatsApp), which is pending.

### Domain wiring worth knowing before building screens

These connections are not visible from a single endpoint and shape multi-screen flows:

- **Recipes / BOM is the hinge** between "what I sell" (orders/menu) and "what I have in
  stock" (inventory). Closing an order decrements stock *through recipes*.
- **Orders is the operational core** — it ties together tables, products, kitchen (KDS),
  delivery, and cash, and triggers inventory deduction.
- **Delivery is an own fleet** (no Rappi-style integrations): real driver management with
  explicit states (pending → assigned → en route → delivered/failed); cash-on-delivery
  touches cash.
- **Audit and messaging are cross-cutting**, not business modules.

## Conventions inherited from this project

- **English-only identifiers (binding).** All code identifiers, API field names, and route
  paths are in English. The Spanish domain vocabulary (e.g. *comanda*, *sucursal*, *arqueo*,
  *receta*) lives only in prose/UI copy, mapped to a fixed English term in code:
  *comanda*→`order`, *sucursal*→`branch`, *receta*→`recipe`, *arqueo*→`cash count`. Pick the
  mapping once per concept and keep it consistent.
- **Multi-branch from day one.** The business runs one branch today but the model is N
  branches. Business entities carry a `branch_id`; design screens and state to scope by
  branch even if only one exists now (consolidated multi-branch reporting is Phase 2).
- **Spec-driven workflow (OpenSpec).** Changes in this repo are managed via OpenSpec
  (`../openspec/`, schema `spec-driven`); specs live in `../openspec/specs/<module>/`. For
  non-trivial frontend work, follow the same propose → implement → archive flow the backend
  used (see the `openspec-*` / `opsx:*` skills).
