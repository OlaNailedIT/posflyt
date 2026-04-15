/**
 * @file LEGACY_ADAPTER_ONLY — Phase 2 Step 7
 *
 * Return pipeline: idempotent on client_return_id, append-only ledger, resumable state machine.
 * **Execution adapter** only — client UFEC owns RETURN_EVENT semantics and enforcement. Do not add
 * new business rules here without extending UFEC first.
 *
 * @see docs/UFEC_PHASE2_DOMINANCE.md
 */

/**
 * Financial reversal engine: idempotent on client_return_id, append-only ledger, resumable state machine.
 * One state transition per DB transaction so crash recovery can resume without double effects.
 */

const prisma = require("../config/prisma");
const { logAudit } = require("./auditService");
const { ensureBusinessSubscription } = require("./subscriptionService");
const {
  roundCurrency,
  assertConsistentPaymentState,
} = require("../utils/paymentState");
const { recordLowStockAlertIfNeeded } = require("./lowStockAlertService");
const { assertSaleQuantity } = require("../utils/productUnits");
const { logUfecLedgerObservation } = require("../utils/ufecLedgerObservation");
const { logLegacyAdapterZone } = require("../utils/ufecLegacyAdapterGuard");

logLegacyAdapterZone("returnService");

const EPS = 1e-6;
const MAX_PIPELINE_STEPS = 16;

function isTerminalFailure(state) {
  return (
    state === "RETURN_FAILED_VALIDATION" ||
    state === "RETURN_FAILED_LEDGER" ||
    state === "RETURN_FAILED_INVENTORY" ||
    state === "RETURN_FAILED_REFUND"
  );
}

/** Mirror RETURN rows linked from SaleReturn must not be double-counted as legacy. */
async function bridgedMirrorTransactionIds(tx, businessId, originalTransactionId) {
  const rows = await tx.saleReturn.findMany({
    where: {
      businessId,
      originalTransactionId,
      returnTransactionId: { not: null },
    },
    select: { returnTransactionId: true },
  });
  return rows.map((r) => r.returnTransactionId).filter(Boolean);
}

/**
 * Quantities already returned: legacy RETURN transactions (excluding mirror rows) + completed SaleReturn lines.
 */
async function getReturnedQtyByProduct(tx, businessId, originalTransactionId, excludeSaleReturnId) {
  const skipIds = await bridgedMirrorTransactionIds(tx, businessId, originalTransactionId);
  const map = new Map();

  const legacyReturns = await tx.transaction.findMany({
    where: {
      businessId,
      originalTransactionId,
      transactionType: "RETURN",
      ...(skipIds.length ? { id: { notIn: skipIds } } : {}),
    },
    include: { items: true },
  });
  for (const r of legacyReturns) {
    for (const it of r.items) {
      const q = Math.abs(Number(it.quantity));
      map.set(it.productId, (map.get(it.productId) || 0) + q);
    }
  }

  const modern = await tx.saleReturn.findMany({
    where: {
      businessId,
      originalTransactionId,
      state: "RETURN_COMPLETED",
      ...(excludeSaleReturnId ? { id: { not: excludeSaleReturnId } } : {}),
    },
    include: { lines: true },
  });
  for (const sr of modern) {
    for (const ln of sr.lines) {
      map.set(ln.productId, (map.get(ln.productId) || 0) + Number(ln.quantity));
    }
  }
  return map;
}

function normalizeRequestedLines(orig, itemsPayload, priorByProduct) {
  const origByProduct = new Map(orig.items.map((it) => [it.productId, it]));
  if (!itemsPayload || !itemsPayload.length) {
    const lines = [];
    for (const it of orig.items) {
      const sold = Math.abs(Number(it.quantity));
      const prior = priorByProduct.get(it.productId) || 0;
      const avail = Math.max(0, sold - prior);
      if (avail <= EPS) continue;
      lines.push({
        productId: it.productId,
        quantity: avail,
        unitPrice: roundCurrency(Number(it.price)),
        origItem: it,
      });
    }
    if (!lines.length) {
      const err = new Error("Nothing left to return for this sale");
      err.statusCode = 400;
      err.code = "ALREADY_FULLY_RETURNED";
      throw err;
    }
    return lines;
  }

  const lines = [];
  for (const row of itemsPayload) {
    const pid = row.product_id;
    const qty = Number(row.quantity);
    if (!pid || !(qty > 0)) {
      const err = new Error("Each return line needs product_id and positive quantity");
      err.statusCode = 400;
      err.code = "VALIDATION_FAILED";
      throw err;
    }
    const oi = origByProduct.get(pid);
    if (!oi) {
      const err = new Error(`Product ${pid} was not on the original sale`);
      err.statusCode = 400;
      err.code = "INVALID_RETURN_LINE";
      throw err;
    }
    try {
      assertSaleQuantity(oi.product, qty, "services/returnService.normalizeRequestedLines");
    } catch (e) {
      e.statusCode = 400;
      e.code = e.code || "INVALID_ITEM_QUANTITY";
      throw e;
    }
    const sold = Math.abs(Number(oi.quantity));
    const prior = priorByProduct.get(pid) || 0;
    if (qty + prior > sold + EPS) {
      const err = new Error("Return quantity exceeds remaining sold quantity");
      err.statusCode = 400;
      err.code = "RETURN_QTY_EXCEEDED";
      throw err;
    }
    lines.push({
      productId: pid,
      quantity: qty,
      unitPrice: roundCurrency(Number(oi.price)),
      origItem: oi,
    });
  }
  if (!lines.length) {
    const err = new Error("No return lines");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }
  return lines;
}

function computeReversalAmounts(orig, lines) {
  let posSub = 0;
  for (const ln of lines) {
    posSub += roundCurrency(ln.quantity * ln.unitPrice);
  }
  posSub = roundCurrency(posSub);
  const origSub =
    orig.subtotalAmount != null
      ? roundCurrency(Number(orig.subtotalAmount))
      : roundCurrency(
          orig.items.reduce(
            (s, it) => s + roundCurrency(Math.abs(Number(it.quantity)) * Number(it.price)),
            0
          )
        );
  const origTax =
    orig.taxAmount != null ? roundCurrency(Number(orig.taxAmount)) : roundCurrency(0);

  const subtotal = roundCurrency(-Math.abs(posSub));
  let taxAmount;
  if (origSub <= EPS) {
    taxAmount = roundCurrency(-Math.abs(origTax));
  } else {
    const ratio = Math.min(1, Math.abs(posSub) / Math.abs(origSub));
    taxAmount = roundCurrency(-Math.abs(origTax) * ratio);
  }
  const total = roundCurrency(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

async function hydrateTransaction(tx, transactionId) {
  return tx.transaction.findUnique({
    where: { id: transactionId },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: {
        include: { product: { select: { id: true, name: true, barcode: true } } },
      },
    },
  });
}

async function markFailure(tx, saleReturnId, state, code, detail) {
  await tx.saleReturn.update({
    where: { id: saleReturnId },
    data: { state, failureCode: code, failureDetail: detail || null },
  });
}

async function getOrCreateSaleReturnRecord({
  tx,
  businessId,
  userId,
  clientReturnId,
  originalTransactionId,
}) {
  const found = await tx.saleReturn.findUnique({
    where: { businessId_clientReturnId: { businessId, clientReturnId } },
  });
  if (found) return found;
  try {
    return await tx.saleReturn.create({
      data: {
        businessId,
        userId,
        clientReturnId,
        originalTransactionId,
        state: "RETURN_INITIATED",
      },
    });
  } catch (e) {
    if (e.code === "P2002") {
      return tx.saleReturn.findUnique({
        where: { businessId_clientReturnId: { businessId, clientReturnId } },
      });
    }
    throw e;
  }
}

function buildLinePayloadFromRows(orig, srLines) {
  return srLines.map((ln) => {
    const oi = orig.items.find((i) => i.productId === ln.productId);
    return {
      productId: ln.productId,
      quantity: Number(ln.quantity),
      unitPrice: roundCurrency(Number(oi.price)),
      origItem: oi,
    };
  });
}

/**
 * @param {string} businessId
 * @param {string} userId
 * @param {{ client_return_id?: string, client_transaction_id?: string, original_transaction_id: string, items?: { product_id: string, quantity: number }[] }} body
 * @param {string|null} requestId
 */
async function createReturnTransaction(businessId, userId, body, requestId) {
  const location = "services/returnService.createReturnTransaction";
  const clientReturnId = body.client_return_id || body.client_transaction_id;
  if (!clientReturnId) {
    const err = new Error("client_return_id or client_transaction_id is required");
    err.statusCode = 400;
    err.code = "VALIDATION_FAILED";
    err.location = location;
    throw err;
  }

  const subscription = await ensureBusinessSubscription(businessId);

  const completedReturn = await prisma.saleReturn.findFirst({
    where: {
      businessId,
      clientReturnId,
      state: "RETURN_COMPLETED",
    },
  });
  if (completedReturn?.returnTransactionId) {
    const hydrated = await hydrateTransaction(prisma, completedReturn.returnTransactionId);
    return { status: "duplicate", transaction: hydrated, saleReturn: completedReturn };
  }

  const legacyDup = await prisma.transaction.findUnique({
    where: { id_businessId: { id: clientReturnId, businessId } },
  });
  if (legacyDup?.transactionType === "RETURN") {
    const hydrated = await hydrateTransaction(prisma, clientReturnId);
    return { status: "duplicate", transaction: hydrated, saleReturn: null };
  }

  let saleReturnId = null;
  let pipelineFinished = false;

  for (let step = 0; step < MAX_PIPELINE_STEPS; step += 1) {
    const snapshot = await prisma.saleReturn.findUnique({
      where: { businessId_clientReturnId: { businessId, clientReturnId } },
      include: { lines: { orderBy: { id: "asc" } } },
    });

    if (snapshot?.state === "RETURN_COMPLETED" && snapshot.returnTransactionId) {
      const hydrated = await hydrateTransaction(prisma, snapshot.returnTransactionId);
      return { status: "duplicate", transaction: hydrated, saleReturn: snapshot };
    }

    if (snapshot && isTerminalFailure(snapshot.state)) {
      const err = new Error(snapshot.failureDetail || "Return previously failed");
      err.statusCode = 400;
      err.code = snapshot.failureCode || "RETURN_FAILED";
      err.location = location;
      throw err;
    }

    const stateBefore = snapshot?.state;

    await prisma.$transaction(
      async (tx) => {
        const sr0 = await getOrCreateSaleReturnRecord({
          tx,
          businessId,
          userId,
          clientReturnId,
          originalTransactionId: body.original_transaction_id,
        });
        saleReturnId = sr0.id;

        if (sr0.state === "RETURN_COMPLETED") {
          return;
        }
        if (isTerminalFailure(sr0.state)) {
          const err = new Error(sr0.failureDetail || "Return previously failed");
          err.statusCode = 400;
          err.code = sr0.failureCode || "RETURN_FAILED";
          err.location = location;
          throw err;
        }

        const orig = await tx.transaction.findFirst({
          where: { id: body.original_transaction_id, businessId, transactionType: "SALE" },
          include: {
            items: { include: { product: true } },
          },
        });
        if (!orig) {
          await markFailure(tx, sr0.id, "RETURN_FAILED_VALIDATION", "NOT_FOUND", "Original sale not found");
          const err = new Error("Original sale not found");
          err.statusCode = 404;
          err.code = "NOT_FOUND";
          err.location = location;
          throw err;
        }

        if (orig.paymentStatus !== "PAID" || Number(orig.balanceDue) > 0.01) {
          await markFailure(
            tx,
            sr0.id,
            "RETURN_FAILED_VALIDATION",
            "RETURN_NOT_ALLOWED",
            "Only fully paid sales can be returned"
          );
          const err = new Error("Only fully paid sales can be returned (settle outstanding credit first)");
          err.statusCode = 400;
          err.code = "RETURN_NOT_ALLOWED";
          err.location = location;
          throw err;
        }

        if (!orig.items?.length) {
          await markFailure(tx, sr0.id, "RETURN_FAILED_VALIDATION", "RETURN_NOT_ALLOWED", "No line items");
          const err = new Error("Original sale has no line items");
          err.statusCode = 400;
          err.code = "RETURN_NOT_ALLOWED";
          err.location = location;
          throw err;
        }

        const priorByProduct = await getReturnedQtyByProduct(tx, businessId, orig.id, sr0.id);

        if (sr0.state === "RETURN_INITIATED") {
          let resolvedLines;
          try {
            resolvedLines = normalizeRequestedLines(orig, body.items, priorByProduct);
          } catch (e) {
            await markFailure(
              tx,
              sr0.id,
              "RETURN_FAILED_VALIDATION",
              e.code || "VALIDATION_FAILED",
              e.message
            );
            throw e;
          }

          await tx.saleReturnLine.deleteMany({ where: { saleReturnId: sr0.id } });
          await tx.saleReturnLine.createMany({
            data: resolvedLines.map((ln) => ({
              saleReturnId: sr0.id,
              productId: ln.productId,
              quantity: ln.quantity,
            })),
          });

          await tx.saleReturn.update({
            where: { id: sr0.id },
            data: { state: "RETURN_VALIDATED" },
          });
          return;
        }

        const sr = await tx.saleReturn.findUnique({
          where: { id: sr0.id },
          include: { lines: { orderBy: { id: "asc" } } },
        });

        if (!sr.lines.length) {
          await markFailure(tx, sr.id, "RETURN_FAILED_VALIDATION", "VALIDATION_FAILED", "Missing return lines");
          const err = new Error("Return lines missing");
          err.statusCode = 400;
          err.code = "VALIDATION_FAILED";
          throw err;
        }

        const linePayload = buildLinePayloadFromRows(orig, sr.lines);
        const amounts = computeReversalAmounts(orig, linePayload);
        const amountPaid = amounts.total;
        const balanceDue = 0;
        assertConsistentPaymentState(amounts.total, amountPaid, balanceDue);

        if (sr.state === "RETURN_VALIDATED") {
          let ledger = await tx.financialLedgerEntry.findUnique({
            where: { saleReturnId: sr.id },
          });
          if (!ledger) {
            try {
              ledger = await tx.financialLedgerEntry.create({
                data: {
                  businessId,
                  kind: "RETURN_REVERSAL",
                  saleReturnId: sr.id,
                  originalTransactionId: orig.id,
                  subtotalAmount: amounts.subtotal,
                  taxAmount: amounts.taxAmount,
                  totalAmount: amounts.total,
                  metadata: {
                    clientReturnId,
                    requestId: requestId || null,
                  },
                },
              });
            } catch (e) {
              if (e.code === "P2002") {
                ledger = await tx.financialLedgerEntry.findUnique({
                  where: { saleReturnId: sr.id },
                });
              } else {
                await markFailure(tx, sr.id, "RETURN_FAILED_LEDGER", "LEDGER_WRITE_FAILED", e.message);
                throw e;
              }
            }
          }
          if (!ledger) {
            await markFailure(tx, sr.id, "RETURN_FAILED_LEDGER", "LEDGER_WRITE_FAILED", "Ledger missing");
            const err = new Error("Ledger write failed");
            err.statusCode = 500;
            err.code = "RETURN_FAILED_LEDGER";
            throw err;
          }
          await tx.saleReturn.update({
            where: { id: sr.id },
            data: { state: "LEDGER_RECORDED" },
          });
          logUfecLedgerObservation({
            phase: "ledger_append",
            eventType: "RETURN_EVENT",
            clientEventId: clientReturnId,
            ledgerEntryId: ledger.id,
            saleReturnId: sr.id,
            totalAmount: amounts.total,
            subtotalAmount: amounts.subtotal,
            taxAmount: amounts.taxAmount,
            orderingNote: "ledger_before_inventory_restore",
          });
          return;
        }

        if (sr.state === "LEDGER_RECORDED") {
          for (const ln of sr.lines) {
            const qty = Number(ln.quantity);
            const stockUpdated = await tx.product.updateMany({
              where: { id: ln.productId, businessId },
              data: { stock: { increment: qty } },
            });
            if (stockUpdated.count !== 1) {
              await markFailure(
                tx,
                sr.id,
                "RETURN_FAILED_INVENTORY",
                "PRODUCT_NOT_FOUND",
                ln.productId
              );
              const err = new Error(`Product not found for return: ${ln.productId}`);
              err.statusCode = 404;
              err.location = location;
              throw err;
            }
          }
          await tx.saleReturn.update({
            where: { id: sr.id },
            data: { state: "INVENTORY_RESTORED" },
          });
          return;
        }

        if (sr.state === "INVENTORY_RESTORED") {
          await tx.saleReturn.update({
            where: { id: sr.id },
            data: { state: "REFUND_PROCESSED" },
          });
          return;
        }

        if (sr.state === "REFUND_PROCESSED") {
          let mirror = await tx.transaction.findUnique({
            where: { id_businessId: { id: clientReturnId, businessId } },
          });
          if (!mirror) {
            const now = new Date();
            let rollupCogs = 0;
            let rollupGlp = 0;
            const mirrorLines = [];
            for (const ln of sr.lines) {
              const oi = orig.items.find((i) => i.productId === ln.productId);
              if (!oi) continue;
              const qtyNeg = -Math.abs(Number(ln.quantity));
              const unitSell = roundCurrency(Number(oi.price));
              const unitCostRaw =
                oi.unitCostAtSale != null && Number.isFinite(Number(oi.unitCostAtSale))
                  ? Number(oi.unitCostAtSale)
                  : Number(oi.product?.costPrice ?? 0);
              const unitCost = roundCurrency(unitCostRaw);
              const lineSub = roundCurrency(qtyNeg * unitSell);
              const lineC = roundCurrency(qtyNeg * unitCost);
              const lineP = roundCurrency(lineSub - lineC);
              rollupCogs = roundCurrency(rollupCogs + lineC);
              rollupGlp = roundCurrency(rollupGlp + lineP);
              mirrorLines.push({
                productId: ln.productId,
                quantity: qtyNeg,
                unitSell,
                unitCost,
                lineSub,
                lineC,
                lineP,
              });
            }

            await tx.transaction.create({
              data: {
                id: clientReturnId,
                businessId,
                userId,
                customerId: orig.customerId,
                paymentMethod: "CASH",
                paymentStatus: "PAID",
                amountPaid,
                balanceDue,
                subtotalAmount: amounts.subtotal,
                taxAmount: amounts.taxAmount,
                transactionType: "RETURN",
                originalTransactionId: orig.id,
                totalAmount: amounts.total,
                totalCogs: rollupCogs,
                grossLineProfit: rollupGlp,
                createdAt: now,
                syncStatus: "SYNCED",
                syncedAt: now,
              },
            });

            for (const ml of mirrorLines) {
              await tx.transactionItem.create({
                data: {
                  transactionId: clientReturnId,
                  productId: ml.productId,
                  quantity: ml.quantity,
                  price: ml.unitSell,
                  unitCostAtSale: ml.unitCost,
                  lineSubtotal: ml.lineSub,
                  lineCost: ml.lineC,
                  lineProfit: ml.lineP,
                },
              });
            }
          }

          await tx.saleReturn.update({
            where: { id: sr.id },
            data: {
              state: "RETURN_COMPLETED",
              returnTransactionId: clientReturnId,
              failureCode: null,
              failureDetail: null,
            },
          });
        }
      },
      { timeout: 25_000, maxWait: 12_000 }
    );

    const after = await prisma.saleReturn.findUnique({
      where: { businessId_clientReturnId: { businessId, clientReturnId } },
    });
    if (after?.state === "RETURN_COMPLETED" && after.returnTransactionId) {
      pipelineFinished = true;
      saleReturnId = after.id;
      break;
    }
    if (after && stateBefore === after.state && !isTerminalFailure(after.state)) {
      const err = new Error("Return pipeline could not advance state");
      err.statusCode = 500;
      err.code = "RETURN_PIPELINE_STUCK";
      err.location = location;
      throw err;
    }
  }

  const final = await prisma.saleReturn.findUnique({
    where: { businessId_clientReturnId: { businessId, clientReturnId } },
  });
  if (pipelineFinished && final?.state === "RETURN_COMPLETED" && final.returnTransactionId) {
    const hydrated = await hydrateTransaction(prisma, final.returnTransactionId);
    await logAudit({
      businessId,
      userId,
      action: "RETURN_CREATED",
      metadata: {
        transactionId: clientReturnId,
        originalTransactionId: body.original_transaction_id,
        requestId: requestId || null,
        pipeline: "ledger_driven",
      },
    });

    const lines = await prisma.saleReturnLine.findMany({ where: { saleReturnId } });
    for (const ln of lines) {
      const productRow = await prisma.product.findUnique({
        where: { id: ln.productId },
        select: {
          id: true,
          name: true,
          lowStockThreshold: true,
          stock: true,
        },
      });
      if (productRow) {
        await recordLowStockAlertIfNeeded(prisma, {
          businessId,
          plan: subscription.plan,
          product: {
            id: productRow.id,
            name: productRow.name,
            lowStockThreshold: productRow.lowStockThreshold,
          },
          newStock: Number(productRow.stock),
          source: "return",
        });
      }
    }

    return { status: "created", transaction: hydrated, saleReturn: final };
  }

  const err = new Error("Return pipeline did not complete");
  err.statusCode = 500;
  err.code = "RETURN_PIPELINE_STUCK";
  err.location = location;
  throw err;
}

module.exports = {
  createReturnTransaction,
};
