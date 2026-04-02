const prisma = require("../config/prisma");
const { nodeEnv } = require("../config/env");
const { logAudit } = require("./auditService");

let schedulerStarted = false;
const businessState = new Map();
const runtimeStatus = {
  lastIncrementalRunAt: null,
  lastFullRunAt: null,
  lastRunType: null,
  lastRunStatus: "idle",
  lastRunError: null,
  lastMismatches: { warning: 0, critical: 0 },
};
let incrementalRunning = false;
let fullRunning = false;

function getOrInitState(businessId) {
  if (!businessState.has(businessId)) {
    businessState.set(businessId, {
      expectedStockByProductId: new Map(),
      initialized: false,
      cursor: new Date(0),
      dailyBaselineAt: null,
      dailyBaselineStockByProductId: new Map(),
    });
  }
  return businessState.get(businessId);
}

async function bootstrapBusinessState(businessId, state) {
  const products = await prisma.product.findMany({
    where: { businessId },
    select: { id: true, stock: true },
  });
  for (const product of products) {
    state.expectedStockByProductId.set(product.id, Number(product.stock || 0));
  }
  state.initialized = true;
  state.cursor = new Date();
  state.dailyBaselineAt = new Date();
  state.dailyBaselineStockByProductId = new Map(products.map((p) => [p.id, Number(p.stock || 0)]));
}

function classifyMismatch(expected, actual) {
  const delta = Math.abs(Number(expected) - Number(actual));
  if (Number(actual) < 0 || Number(expected) < 0 || delta >= 5) return "critical";
  return "warning";
}

async function logMismatch({ businessId, product, expected, actual, location, runType }) {
  const severity = classifyMismatch(expected, actual);
  const action =
    severity === "critical" ? "INVENTORY_MISMATCH_CRITICAL" : "INVENTORY_MISMATCH_WARNING";
  await logAudit({
    businessId,
    action,
    metadata: {
      productId: product.id,
      productName: product.name,
      expectedStock: expected,
      actualStock: actual,
      delta: Math.abs(Number(expected) - Number(actual)),
      severity,
      runType,
      location,
    },
  });
  runtimeStatus.lastMismatches[severity] += 1;
  // eslint-disable-next-line no-console
  console.error("[POSflyt][inventory-reconciliation]", {
    status: severity,
    message: "Inventory mismatch detected",
    location,
    businessId,
    productId: product.id,
    expectedStock: expected,
    actualStock: actual,
    runType,
  });
}

async function reconcileBusinessStockIncremental(businessId) {
  const location = "services/inventoryIntegrityService.reconcileBusinessStockIncremental";
  const state = getOrInitState(businessId);
  if (!state.initialized) {
    await bootstrapBusinessState(businessId, state);
    return;
  }

  const transactions = await prisma.transaction.findMany({
    where: { businessId, createdAt: { gt: state.cursor } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      createdAt: true,
      items: { select: { productId: true, quantity: true } },
    },
  });

  for (const tx of transactions) {
    for (const item of tx.items) {
      const prev = Number(state.expectedStockByProductId.get(item.productId) || 0);
      state.expectedStockByProductId.set(item.productId, prev - Number(item.quantity || 0));
    }
  }

  if (transactions.length) {
    state.cursor = transactions[transactions.length - 1].createdAt;
  }

  const products = await prisma.product.findMany({
    where: { businessId },
    select: { id: true, stock: true, name: true },
  });

  for (const product of products) {
    const expected = Number(state.expectedStockByProductId.get(product.id) || 0);
    const actual = Number(product.stock || 0);
    if (actual < 0 || expected !== actual) {
      await logMismatch({
        businessId,
        product,
        expected,
        actual,
        location,
        runType: "incremental",
      });
      state.expectedStockByProductId.set(product.id, actual);
    }
  }
}

async function reconcileBusinessStockFull(businessId) {
  const location = "services/inventoryIntegrityService.reconcileBusinessStockFull";
  const state = getOrInitState(businessId);
  if (!state.initialized) {
    await bootstrapBusinessState(businessId, state);
    return;
  }

  if (!state.dailyBaselineAt) {
    state.dailyBaselineAt = new Date();
  }
  if (state.dailyBaselineStockByProductId.size === 0) {
    const productsNow = await prisma.product.findMany({
      where: { businessId },
      select: { id: true, stock: true },
    });
    state.dailyBaselineStockByProductId = new Map(
      productsNow.map((p) => [p.id, Number(p.stock || 0)])
    );
  }

  const soldByProduct = await prisma.transactionItem.groupBy({
    by: ["productId"],
    where: {
      transaction: {
        businessId,
        createdAt: { gt: state.dailyBaselineAt },
      },
    },
    _sum: { quantity: true },
  });
  const soldMap = new Map(soldByProduct.map((row) => [row.productId, Number(row._sum.quantity || 0)]));

  const products = await prisma.product.findMany({
    where: { businessId },
    select: { id: true, stock: true, name: true },
  });
  for (const product of products) {
    const baseline = Number(state.dailyBaselineStockByProductId.get(product.id) || 0);
    const soldSinceBaseline = Number(soldMap.get(product.id) || 0);
    const expected = baseline - soldSinceBaseline;
    const actual = Number(product.stock || 0);
    if (actual < 0 || expected !== actual) {
      await logMismatch({
        businessId,
        product,
        expected,
        actual,
        location,
        runType: "full",
      });
    }
  }

  state.dailyBaselineAt = new Date();
  state.dailyBaselineStockByProductId = new Map(products.map((p) => [p.id, Number(p.stock || 0)]));
}

async function reconcileAllBusinessesIncremental() {
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const business of businesses) {
    // eslint-disable-next-line no-await-in-loop
    await reconcileBusinessStockIncremental(business.id);
  }
}

async function reconcileAllBusinessesFull() {
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const business of businesses) {
    // eslint-disable-next-line no-await-in-loop
    await reconcileBusinessStockFull(business.id);
  }
}

async function runReconciliation(runType, runner) {
  if (runType === "incremental" && incrementalRunning) return;
  if (runType === "full" && fullRunning) return;
  if (runType === "incremental") incrementalRunning = true;
  if (runType === "full") fullRunning = true;

  runtimeStatus.lastRunType = runType;
  runtimeStatus.lastRunStatus = "running";
  runtimeStatus.lastRunError = null;
  runtimeStatus.lastMismatches = { warning: 0, critical: 0 };
  try {
    await runner();
    runtimeStatus.lastRunStatus = "ok";
    if (runType === "incremental") runtimeStatus.lastIncrementalRunAt = new Date().toISOString();
    if (runType === "full") runtimeStatus.lastFullRunAt = new Date().toISOString();
  } catch (error) {
    runtimeStatus.lastRunStatus = "error";
    runtimeStatus.lastRunError = error.message || "Unknown reconciliation error";
    // eslint-disable-next-line no-console
    console.error("[POSflyt][inventory-reconciliation]", {
      status: "error",
      message: runtimeStatus.lastRunError,
      location: `services/inventoryIntegrityService.runReconciliation(${runType})`,
    });
  } finally {
    if (runType === "incremental") incrementalRunning = false;
    if (runType === "full") fullRunning = false;
  }
}

function getInventoryIntegrityStatus() {
  return {
    ...runtimeStatus,
    monitoredBusinesses: businessState.size,
  };
}

function startInventoryIntegrityMonitor() {
  if (schedulerStarted || nodeEnv === "test") return;
  schedulerStarted = true;
  setInterval(() => {
    runReconciliation("incremental", reconcileAllBusinessesIncremental);
  }, 1000 * 60 * 5);
  setInterval(() => {
    runReconciliation("full", reconcileAllBusinessesFull);
  }, 1000 * 60 * 60 * 24);
  runReconciliation("incremental", reconcileAllBusinessesIncremental);
  runReconciliation("full", reconcileAllBusinessesFull);
}

module.exports = {
  startInventoryIntegrityMonitor,
  reconcileAllBusinessesIncremental,
  reconcileAllBusinessesFull,
  getInventoryIntegrityStatus,
};
