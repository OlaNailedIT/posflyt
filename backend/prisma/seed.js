/**
 * P0.3.1 — Realistic demo data for production-style simulation.
 *
 * Run (from backend/):  npx prisma db seed
 *   or:                 npm run seed
 *
 * Env:
 *   SEED_OWNER_PASSWORD  — demo user password (default: DemoSeed2026!)
 *
 * Idempotent: skips if business "Demo Retail Store (P0.3 Seed)" already exists.
 *
 * ---
 * Manual phases (you run these — UI or API):
 * P0.3.2  Normal + multi-item POS; verify stock, totals.
 * P0.3.3  Partial / credit / settlement; overpay + double-submit idempotency.
 * P0.3.4  Offline: disconnect, sell, reconnect; verify IndexedDB + sync (no dupes).
 * P0.3.5  Kill server mid-request; invalid qty/price; bad DATABASE_URL → errors.
 * P0.3.6  npm run audit:integrity
 * P0.3.7  Trace via structured logs (event SYNC_*, requestId) — see transactionController + pino.
 */

require("../src/config/env");
const prisma = require("../src/config/prisma");
const crypto = require("crypto");
const { hashPassword } = require("../src/utils/password");

const SEED_BUSINESS_NAME = "Demo Retail Store (P0.3 Seed)";
const SEED_OWNER_EMAIL = "demo.owner@posflyt-seed.local";
const DEFAULT_PASSWORD = "DemoSeed2026!";

async function main() {
  const existing = await prisma.business.findFirst({
    where: { name: SEED_BUSINESS_NAME },
    select: { id: true },
  });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(
      `Seed skipped: business "${SEED_BUSINESS_NAME}" already exists (id=${existing.id}).`
    );
    return;
  }

  const ownerPassword = process.env.SEED_OWNER_PASSWORD || DEFAULT_PASSWORD;
  const passwordHash = await hashPassword(ownerPassword);

  const businessId = crypto.randomUUID();
  const storeId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const subId = crypto.randomUUID();
  const settingsId = crypto.randomUUID();
  const onboardingId = crypto.randomUUID();

  const riceId = crypto.randomUUID();
  const oilId = crypto.randomUUID();
  const breadId = crypto.randomUUID();
  const customerId = crypto.randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.business.create({
      data: {
        id: businessId,
        name: SEED_BUSINESS_NAME,
        subscription: {
          create: {
            id: subId,
            plan: "FREE",
            status: "ACTIVE",
          },
        },
        settings: {
          create: {
            id: settingsId,
            businessName: SEED_BUSINESS_NAME,
            businessEmail: "hello@demo-retail.seed",
            businessPhone: "+2348000000000",
            countryCode: "NG",
            currencyCode: "NGN",
            currencySymbol: "₦",
            businessTimeZone: "Africa/Lagos",
          },
        },
        onboarding: {
          create: {
            id: onboardingId,
            firstProductDone: true,
            firstSaleDone: false,
          },
        },
        stores: {
          create: {
            id: storeId,
            name: "Main Store",
            location: "Lagos",
          },
        },
        users: {
          create: {
            id: userId,
            name: "Demo Owner",
            email: SEED_OWNER_EMAIL,
            password: passwordHash,
            role: "ADMIN",
          },
        },
      },
    });

    const productRows = [
      {
        id: riceId,
        name: "Rice (25kg)",
        costPrice: 28000,
        sellingPrice: 35000,
        price: 35000,
        unitType: "unit",
        stock: 50,
        lowStockThreshold: 5,
        businessId,
        storeId,
      },
      {
        id: oilId,
        name: "Vegetable Oil (5L)",
        costPrice: 9000,
        sellingPrice: 12000,
        price: 12000,
        unitType: "unit",
        stock: 30,
        lowStockThreshold: 5,
        businessId,
        storeId,
      },
      {
        id: breadId,
        name: "Bread (loaf)",
        costPrice: 900,
        sellingPrice: 1500,
        price: 1500,
        unitType: "unit",
        stock: 100,
        lowStockThreshold: 10,
        businessId,
        storeId,
      },
    ];
    for (const row of productRows) {
      // eslint-disable-next-line no-await-in-loop
      await tx.product.create({ data: row });
    }

    await tx.customer.create({
      data: {
        id: customerId,
        name: "John Doe",
        phone: "08000000000",
        businessId,
        totalOutstanding: 0,
      },
    });
  });

  // eslint-disable-next-line no-console
  console.log(`
P0.3 seed complete — "${SEED_BUSINESS_NAME}"

Login (API / app sign-in):
  email:    ${SEED_OWNER_EMAIL}
  password: ${ownerPassword === DEFAULT_PASSWORD ? `${DEFAULT_PASSWORD}  (override with SEED_OWNER_PASSWORD)` : "(from SEED_OWNER_PASSWORD)"}

IDs (for API / Postman):
  businessId   ${businessId}
  storeId      ${storeId}
  userId       ${userId}
  customerId   ${customerId}  (John Doe — credit / partial flows)
  products:
    rice   ${riceId}
    oil    ${oilId}
    bread  ${breadId}

Next: P0.3.2–P0.3.5 manual scenarios, then: npm run audit:integrity
`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
