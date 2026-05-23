# LocalThreads PH — Project Knowledge Base

> Generated: 2026-05-23
> Scope: Full codebase snapshot of the freshly scaffolded monorepo.
> Audience: All future feature implementation agents working on this project.

---

## 1. Project Overview

**LocalThreads PH** is a discovery and e-commerce marketplace exclusively for local Philippine clothing brands. It gives small-to-established PH brands their own customizable storefront while exposing them to a shared shopper audience. The mental model is "Shopee, but community-first and exclusive to homegrown PH labels."

### Three user personas

| Persona | Primary concern |
|---|---|
| Shopper | Discover, browse, and buy from local brands |
| Brand Owner | Self-manage storefront, products, and incoming orders |
| Admin | Approve brand applications, configure shipping platform-wide |

### Tech stack at a glance

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js (App Router) | 16.2.6 |
| Frontend styling | Tailwind CSS v4 + shadcn/ui | ^4 |
| Backend | NestJS | ^11 |
| Runtime | Node.js | — |
| Database | PostgreSQL | 16 (Docker) |
| ORM | Prisma | ^6 |
| Auth | Passport-JWT + refresh tokens | — |
| Payment | PayMongo (GCash / Maya / card) | — |
| Shipping | Shipmates (PH aggregator) | — |
| File storage | Cloudinary (direct browser upload) | — |
| Email | Resend | ^4 |
| Notifications | HTTP polling (20 s interval) | — |
| Package manager | pnpm workspaces | — |
| Deployment — frontend | Vercel | — |
| Deployment — backend + DB | Railway | — |

---

## 2. Monorepo Structure

```
/
├── apps/
│   ├── web/          # @localthreads/web  — Next.js 16 frontend (Vercel)
│   └── api/          # @localthreads/api  — NestJS backend (Railway)
├── packages/
│   └── types/        # @localthreads/types — shared TypeScript interfaces
├── wiki/
│   ├── build/
│   │   ├── project-brief.md
│   │   └── implementation-roadmap.md
│   └── knowledge/
│       └── knowledge.md   ← this file
├── docker-compose.yml      # PostgreSQL 16 local dev container
├── pnpm-workspace.yaml     # workspace globs: apps/* + packages/*
└── vercel.json             # Vercel build config for web app
```

### Package identities

| Package | Name in workspace | Entry point |
|---|---|---|
| `apps/web` | `@localthreads/web` | Next.js app router |
| `apps/api` | `@localthreads/api` | `src/main.ts` |
| `packages/types` | `@localthreads/types` | `src/index.ts` (TypeScript source, no build step) |

Both `apps/web` and `apps/api` declare `"@localthreads/types": "workspace:*"` as a dependency. Types are consumed directly from source — there is no compile step for the types package.

### pnpm workspace config (`pnpm-workspace.yaml`)

```yaml
packages:
  - 'apps/*'
  - 'packages/*'

allowBuilds:
  '@nestjs/core': true
  '@prisma/client': true
  '@prisma/engines': true
  bcrypt: true
  prisma: true
  sharp: true
  unrs-resolver: true
```

Native modules (`bcrypt`, `prisma`, `sharp`) are explicitly allowlisted so pnpm does not block postinstall scripts.

### Vercel deployment config (`vercel.json`)

```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @localthreads/web build",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs",
  "rootDirectory": "apps/web"
}
```

Vercel's root directory is `apps/web`. The install command runs from the monorepo root so workspace symlinks resolve correctly.

---

## 3. Database Schema

Database: PostgreSQL 16 via Prisma 6. Connection string must include `?connection_limit=5&pool_timeout=20` (Railway connection pool constraint).

### Models

#### `User` (`users`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID | PK |
| `email` | `String` | unique |
| `passwordHash` | `String` | bcrypt |
| `name` | `String` | — |
| `role` | `UserRole` | default `SHOPPER` |
| `createdAt` | `DateTime` | — |
| `updatedAt` | `DateTime` | auto-updated |

Relations: one optional `Brand`, many `Order` (as shopper), many `RefreshToken`, many `Notification`.

#### `RefreshToken` (`refresh_tokens`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID | PK |
| `token` | `String` | unique, opaque token stored server-side |
| `userId` | `String` | FK → `users.id` (cascade delete) |
| `expiresAt` | `DateTime` | — |
| `createdAt` | `DateTime` | — |

Enables server-side revocation of refresh tokens (e.g., on ban or logout).

#### `Brand` (`brands`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID | PK |
| `name` | `String` | — |
| `slug` | `String` | unique, drives `/brands/[slug]` |
| `description` | `String` | — |
| `logoUrl` | `String?` | Cloudinary URL |
| `bannerUrl` | `String?` | Cloudinary URL |
| `location` | `String?` | city/region string |
| `status` | `BrandStatus` | default `PENDING` |
| `socialLinks` | `Json` | default `{}` — see `SocialLinks` type |
| `themeColor` | `String?` | hex color for storefront |
| `ownerId` | `String` | unique FK → `users.id` |
| `createdAt` | `DateTime` | — |
| `updatedAt` | `DateTime` | auto-updated |

Relations: one `User` (owner), many `Product`, many `Order`.

A brand in `PENDING` or `REJECTED` status is not publicly visible. Only `ACTIVE` brands are surfaced to shoppers.

#### `Product` (`products`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID | PK |
| `name` | `String` | — |
| `description` | `String` | — |
| `price` | `Decimal(10,2)` | monetary precision |
| `stock` | `Int` | default `0` |
| `status` | `ProductStatus` | default `DRAFT` |
| `images` | `String[]` | array of Cloudinary URLs, max 8 |
| `category` | `String` | — |
| `brandId` | `String` | FK → `brands.id` |
| `createdAt` | `DateTime` | — |
| `updatedAt` | `DateTime` | auto-updated |

Relations: one `Brand`, many `OrderItem`.

Only `PUBLISHED` products appear on storefronts and the discovery feed.

#### `Order` (`orders`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID | PK |
| `orderNumber` | `String` | unique, human-readable (generated on creation) |
| `status` | `OrderStatus` | default `PENDING_PAYMENT` |
| `totalAmount` | `Decimal(10,2)` | — |
| `shippingFee` | `Decimal(10,2)` | — |
| `shippingAddress` | `Json` | see `ShippingAddress` type |
| `trackingNumber` | `String?` | set by brand owner when shipping |
| `shippingCourier` | `String?` | e.g. "J&T", "Ninja Van" |
| `paymongoPaymentId` | `String?` | stored after webhook confirmation |
| `shopperId` | `String` | FK → `users.id` |
| `brandId` | `String` | FK → `brands.id` |
| `createdAt` | `DateTime` | — |
| `updatedAt` | `DateTime` | auto-updated |

Relations: one `User` (shopper), one `Brand`, many `OrderItem`, many `Notification`.

#### `OrderItem` (`order_items`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID | PK |
| `productId` | `String` | FK → `products.id` |
| `productName` | `String` | snapshot at order time |
| `productImage` | `String` | snapshot at order time |
| `quantity` | `Int` | — |
| `unitPrice` | `Decimal(10,2)` | snapshot at order time |
| `orderId` | `String` | FK → `orders.id` (cascade delete) |

Product name/image/price are snapshotted so historical orders are immune to product edits.

#### `Notification` (`notifications`)

| Field | Type | Notes |
|---|---|---|
| `id` | `String` UUID | PK |
| `userId` | `String` | FK → `users.id` (cascade delete) |
| `title` | `String` | — |
| `message` | `String` | — |
| `isRead` | `Boolean` | default `false` |
| `orderId` | `String?` | optional FK → `orders.id` (set null on delete) |
| `createdAt` | `DateTime` | — |

Polled via `GET /api/notifications/unread` on a 20-second interval from the frontend.

### Enums

```
UserRole:    SHOPPER | BRAND_OWNER | ADMIN
BrandStatus: PENDING | ACTIVE | REJECTED | SUSPENDED
ProductStatus: DRAFT | PUBLISHED
OrderStatus: PENDING_PAYMENT | PAID | TO_SHIP | SHIPPED | TO_RECEIVE | COMPLETED | CANCELLED
```

### Relationship diagram (abbreviated)

```
User ─────────┬── Brand (one-to-one via ownerId)
              │     └── Product (many)
              │     └── Order (many, as recipient brand)
              └── Order[] (as shopper)
              └── RefreshToken[]
              └── Notification[]

Order ──────── OrderItem[]
Order ──────── Notification[]
```

---

## 4. API Architecture

### Global bootstrap (`apps/api/src/main.ts`)

| Setting | Value |
|---|---|
| Global prefix | `/api` — all routes are `/api/...` |
| CORS origin | `process.env.FRONTEND_URL` (fallback: `http://localhost:3000`) |
| CORS credentials | `true` (cookies sent cross-origin) |
| ValidationPipe — `whitelist` | `true` — strips unknown properties |
| ValidationPipe — `forbidNonWhitelisted` | `true` — rejects requests with unknown properties |
| ValidationPipe — `transform` | `true` — auto-transforms primitives (string → number, etc.) |
| Global exception filter | `GlobalExceptionFilter` (normalizes all errors to `ApiResponse` shape) |
| Default port | `3001` (override with `PORT` env var) |

### NestJS module map (`apps/api/src/`)

```
src/
├── main.ts                    # Bootstrap (above)
├── app.module.ts              # Root module — imports ConfigModule (global) + PrismaModule
├── app.controller.ts          # Health check
├── app.service.ts             # —
├── prisma/
│   ├── prisma.module.ts       # Global Prisma module
│   └── prisma.service.ts      # PrismaClient wrapper (onModuleInit connect)
├── auth/                      # Phase 2 — JWT auth, registration, login, refresh
├── brands/                    # Phase 3 — brand CRUD, admin approval
├── products/                  # Phase 4 — product CRUD, image URLs
├── orders/                    # Phase 5/6 — order state machine
├── payments/                  # Phase 5 — PayMongo session creation + webhook handler
├── shipping/                  # Phase 5 — ShippingService abstraction over Shipmates
├── notifications/             # Phase 5/6 — create and poll notifications
├── users/                     # Supporting — user profile reads
└── common/
    ├── filters/
    │   └── http-exception.filter.ts   # GlobalExceptionFilter
    ├── guards/
    │   └── roles.guard.ts             # Role-based access control
    ├── decorators/
    │   ├── current-user.decorator.ts  # @CurrentUser() param decorator
    │   └── roles.decorator.ts         # @Roles() metadata decorator
    └── interceptors/                  # (directory scaffolded, implementations TBD)
```

### `ConfigModule` setup

`ConfigModule.forRoot({ isGlobal: true })` — all modules can inject `ConfigService` without re-importing. Reads from `.env` at the project root of `apps/api`.

### `PrismaModule`

Marked global. Exports `PrismaService` so every feature module gets the DB client without repeated imports.

### Common patterns baked in

- **`@CurrentUser()` decorator** — extracts the authenticated user from the request object after Passport JWT validation.
- **`@Roles()` + `RolesGuard`** — decorator-driven RBAC. Apply `@Roles(UserRole.BRAND_OWNER)` to any route handler and the guard enforces it.
- **`GlobalExceptionFilter`** — catches all unhandled exceptions and serializes them into the `ApiResponse<T>` envelope so the frontend always gets `{ success, data, error }`.

---

## 5. Shared Types (`packages/types`)

All types live in `packages/types/src/index.ts` and are consumed directly from TypeScript source (no build step). Both `apps/web` and `apps/api` reference `@localthreads/types` via the pnpm workspace.

### Enums (string union types)

```typescript
UserRole    = 'SHOPPER' | 'BRAND_OWNER' | 'ADMIN'
BrandStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
ProductStatus = 'DRAFT' | 'PUBLISHED'
OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'TO_SHIP' | 'SHIPPED'
              | 'TO_RECEIVE' | 'COMPLETED' | 'CANCELLED'
```

### Interfaces

| Interface | Purpose |
|---|---|
| `User` | Auth context — id, email, name, role, createdAt |
| `Brand` | Full brand record — slug, status, socialLinks (`SocialLinks`), ownerId |
| `SocialLinks` | `{ instagram?, tiktok?, facebook?, website? }` |
| `Product` | Full product — price as `number`, images as `string[]`, optional nested brand |
| `Order` | Full order — shippingAddress as `ShippingAddress`, items as `OrderItem[]` |
| `OrderItem` | Snapshotted line item — productName, productImage, unitPrice |
| `ShippingAddress` | `{ fullName, phone, line1, line2?, city, province, postalCode, country }` |
| `Notification` | Polling payload — id, title, message, isRead, orderId? |
| `PaginatedResponse<T>` | `{ data: T[], total, page, limit, totalPages }` |
| `ApiResponse<T>` | `{ success: boolean, data?: T, message?, error? }` — wire envelope |

**Important:** `price`, `totalAmount`, `shippingFee`, `unitPrice` are typed as `number` in the shared interfaces (Prisma returns `Decimal` on the backend, which is serialized to a plain number in JSON). Do not store monetary values as floating-point in JS logic — use string formatting at display time only.

---

## 6. Environment Variables

### `apps/api/.env` (backend)

| Variable | Example | Used by |
|---|---|---|
| `DATABASE_URL` | `postgresql://localthreads:localthreads_dev@localhost:5432/localthreads?connection_limit=5&pool_timeout=20` | Prisma |
| `JWT_ACCESS_SECRET` | (long random string) | Passport-JWT access token signing |
| `JWT_REFRESH_SECRET` | (different long random string) | Passport-JWT refresh token signing |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `PORT` | `3001` | `main.ts` listen port |
| `NODE_ENV` | `development` | General environment flag |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin |
| `RESEND_API_KEY` | `re_...` | Resend email SDK |
| `RESEND_FROM_EMAIL` | `noreply@localthreads.ph` | Email `from` field |
| `CLOUDINARY_CLOUD_NAME` | — | Signed URL generation |
| `CLOUDINARY_API_KEY` | — | Signed URL generation |
| `CLOUDINARY_API_SECRET` | — | Signed URL generation |
| `PAYMONGO_SECRET_KEY` | `sk_test_...` | PayMongo API calls |
| `PAYMONGO_PUBLIC_KEY` | `pk_test_...` | Passed to frontend for client-side SDK (if used) |
| `PAYMONGO_WEBHOOK_SECRET` | `whsec_...` | HMAC-SHA256 webhook signature verification |
| `SHIPMATES_API_KEY` | — | Shipmates shipping rate API |
| `SHIPMATES_API_URL` | `https://api.shipmates.ph` | Shipmates base URL |

### `apps/web/.env.local` (frontend — not committed)

| Variable | Example | Used by |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | `apps/web/src/lib/api.ts` — all API calls |

---

## 7. Key Patterns

These architectural decisions are already baked in. Every future feature must follow them without relitigating the choice.

### 7.1 Multi-tenant `brandId` guard

Every Prisma query that reads or writes brand-owned data (products, orders, storefront settings) must include a `WHERE brandId = [jwt.brandId]` clause. Prisma has no row-level security — this guard is the only thing preventing Brand A from reading or mutating Brand B's data. Establish this in the service layer, not the controller.

```typescript
// Correct — always scope to the authenticated brand
return this.prisma.product.findMany({ where: { brandId: user.brandId } });

// Wrong — leaks cross-brand data
return this.prisma.product.findMany();
```

### 7.2 Cloudinary direct upload (browser → Cloudinary → NestJS saves URL)

NestJS never receives the raw file bytes. Flow:

1. Frontend requests a signed upload URL from `POST /api/products/upload-signature` (NestJS generates it using Cloudinary SDK + `CLOUDINARY_API_SECRET`).
2. Browser uploads directly to Cloudinary using the signed preset.
3. Cloudinary returns the public URL.
4. Frontend sends the Cloudinary URL to NestJS as part of the product create/update payload.
5. NestJS stores the URL string.

Constraints: max 8 images per product, max 5 MB each, accepted formats: jpeg, png, webp.

### 7.3 Polling, not SSE

The frontend polls `GET /api/notifications/unread` every 20 seconds. SSE (Server-Sent Events) was explicitly rejected because Railway's proxy kills long-lived HTTP connections. Do not introduce SSE or WebSockets without re-evaluating the deployment target.

### 7.4 Passport-JWT with server-side refresh tokens

- **Access token:** short-lived (15 min), signed with `JWT_ACCESS_SECRET`, carried as a cookie or `Authorization: Bearer` header.
- **Refresh token:** long-lived (7 days), stored as a hashed opaque token in the `refresh_tokens` table, signed with `JWT_REFRESH_SECRET`.
- **Revocation:** deleting the `RefreshToken` row immediately revokes a session — critical for banning brand owners.
- **Rotation:** on refresh, old token is deleted and a new one is issued.

### 7.5 Order state machine

Valid transitions only (server enforces with 422 on invalid jump):

```
PENDING_PAYMENT → PAID          (PayMongo webhook confirms payment)
PAID            → TO_SHIP       (internal — admin/system sets after payment confirmed)
TO_SHIP         → SHIPPED       (Brand Owner enters tracking number)
SHIPPED         → TO_RECEIVE    (internal or courier update)
TO_RECEIVE      → COMPLETED     (Shopper marks received)
any             → CANCELLED     (within allowed window — business rules TBD)
```

The allowed-transitions map lives in the `OrdersService`. Controllers call a single `transitionStatus(orderId, newStatus, actorRole)` method — they never write `status` directly.

### 7.6 `ShippingService` abstraction

All Shipmates API calls go through `ShippingService`. No feature module calls Shipmates directly. This lets you:
- Stub `ShippingService` during early development (return hardcoded rate).
- Swap couriers or add a second aggregator without touching callsites.
- Mock easily in unit tests.

### 7.7 `apiFetch` — frontend API client (`apps/web/src/lib/api.ts`)

All frontend API calls use the single `apiFetch<T>(path, options?)` helper:

- Prepends `NEXT_PUBLIC_API_URL` + `/api` to every path.
- Always sends `credentials: 'include'` (cookie auth).
- Defaults `Content-Type: application/json`.
- Unwraps the `ApiResponse<T>` envelope — throws on `!success` or non-2xx.
- Callers receive `T` directly, not the wrapper.

```typescript
// Usage
const products = await apiFetch<Product[]>('/products?brandId=xxx');
```

### 7.8 Email sending lives in NestJS only

`Resend` is installed in `apps/api` only. Never send email from Next.js API routes or Server Actions — the Next.js edge runtime is incompatible with Resend's Node.js SDK. All transactional email (order confirmations, brand approval, state-change notifications) goes through NestJS services.

### 7.9 Prisma migration discipline

- Development: `pnpm --filter @localthreads/api exec prisma migrate dev --name <name>`
- Production (Railway): `prisma migrate deploy` runs as a pre-deploy step, never on application startup.
- Never use `prisma db push` in production.

---

## 8. Development Setup

### Prerequisites

- Node.js (LTS)
- pnpm (`npm install -g pnpm`)
- Docker Desktop (for PostgreSQL)

### Step-by-step

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start PostgreSQL
docker compose up -d

# 3. Configure backend environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — fill in JWT secrets at minimum

# 4. Configure frontend environment
echo 'NEXT_PUBLIC_API_URL=http://localhost:3001' > apps/web/.env.local

# 5. Run Prisma migrations (creates all tables)
pnpm --filter @localthreads/api exec prisma migrate dev --name init

# 6. (Optional) Seed the database
pnpm --filter @localthreads/api exec prisma db seed

# 7. Start both dev servers (two terminals)
pnpm --filter @localthreads/api start:dev   # NestJS on :3001
pnpm --filter @localthreads/web dev          # Next.js on :3000
```

### Docker PostgreSQL details

```
Container name: localthreads_db
Image:          postgres:16-alpine
Port:           5432
User:           localthreads
Password:       localthreads_dev
Database:       localthreads
Volume:         postgres_data (persists between restarts)
```

### PayMongo webhook development

PayMongo webhooks cannot be received on `localhost`. Use one of:
- `ngrok http 3001` — exposes `http://localhost:3001` via a public URL
- Cloudflare Tunnel (`cloudflared tunnel`)

Register the tunnel URL as the webhook endpoint in the PayMongo dashboard during development.

### Useful Prisma commands

```bash
# Open Prisma Studio (DB GUI)
pnpm --filter @localthreads/api exec prisma studio

# Generate Prisma client after schema change
pnpm --filter @localthreads/api exec prisma generate

# Create a new migration
pnpm --filter @localthreads/api exec prisma migrate dev --name <description>
```

---

## 9. Implementation Roadmap Summary

Eight sequential phases — each builds on the previous. The payment-to-order-to-notification-to-shipping chain is the product; build that before discovery or storefront UI.

| Phase | Name | Summary |
|---|---|---|
| 1 | Foundation | Monorepo scaffold, PostgreSQL in Docker, Prisma schema, base env config — already complete |
| 2 | Auth & User Roles | Registration, login, Passport-JWT + refresh tokens, role guards, password reset via Resend |
| 3 | Brand Onboarding & Approval | Brand creation (Pending state), admin approve/reject dashboard, activation email, public slug |
| 4 | Product Management | Product CRUD for brand owners, Cloudinary multi-image upload, draft/publish toggle, product detail page (SSR) |
| 5 | Checkout & Payment | Cart, shipping address, Shipmates rate fetch, PayMongo checkout session, HMAC-SHA256 webhook, order creation, order state machine, confirmation emails, polling notifications |
| 6 | Order Management Dashboards | Brand owner and shopper order dashboards with tab-filtered status views, mark-as-shipped with tracking number, state-change emails |
| 7 | Brand Storefront | Public `/brands/[slug]` page (SSR), storefront editor for brand owners, theme color, social links |
| 8 | Discovery Feed & Search | Homepage featured brands + newest products, PostgreSQL full-text search, location/category filters, SEO meta tags |

### Cross-cutting rules that apply to every phase

1. Every Prisma query on brand-owned data must be scoped by `brandId`.
2. `DATABASE_URL` must include `?connection_limit=5&pool_timeout=20`.
3. All email sending is in NestJS — never in Next.js.
4. Cloudinary uploads are always browser-direct via signed preset.
5. `prisma migrate deploy` is a Railway pre-deploy step, not application startup code.
6. Shared interfaces go in `packages/types` — frontend and backend must never drift on type definitions.
