const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const prisma = require("../config/prisma");
const { logger } = require("../utils/logger");
const { isFeatureEnabled } = require("./featureFlagService");
const { paymentStatusToApi, roundCurrency } = require("../utils/paymentState");

const RECEIPTS_SUBDIR = path.join("data", "receipts");

function receiptsDir() {
  const base = process.cwd();
  const dir = path.join(base, RECEIPTS_SUBDIR);
  return dir;
}

function ensureReceiptsDir() {
  const dir = receiptsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function receiptPdfPath(receiptId) {
  return path.join(receiptsDir(), `${receiptId}.pdf`);
}

/**
 * Build PDF buffer from the same receipt shape returned to POS clients.
 */
function buildReceiptPdfBuffer(receipt) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const sym = receipt.business?.currencySymbol || "$";
    const fmt = (n) => `${sym}${Number(n).toFixed(2)}`;

    doc.fontSize(18).text(receipt.business?.name || "Receipt", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#444444");
    if (receipt.business?.phone) doc.text(`Phone: ${receipt.business.phone}`, { align: "center" });
    if (receipt.business?.email) doc.text(receipt.business.email, { align: "center" });
    doc.moveDown();
    doc.fontSize(9).text(`Transaction: ${receipt.transaction?.id || ""}`, { align: "center" });
    doc.text(
      `Date: ${receipt.transaction?.dateTime ? new Date(receipt.transaction.dateTime).toISOString() : ""}`,
      { align: "center" }
    );
    doc.fillColor("#000000");
    doc.moveDown(1.2);
    doc.fontSize(11).text("Items", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    for (const item of receipt.items || []) {
      doc.text(`${item.productName}  ×${item.quantity}  @ ${fmt(item.unitPrice)}  = ${fmt(item.lineTotal)}`);
      doc.moveDown(0.2);
    }
    doc.moveDown(0.6);
    const payLines = receipt.transaction?.payments;
    if (Array.isArray(payLines) && payLines.length) {
      doc.fontSize(10).text("Payments", { underline: true });
      doc.moveDown(0.2);
      for (const p of payLines) {
        doc.text(`${p.type}: ${fmt(p.amount)}`);
        doc.moveDown(0.15);
      }
      doc.moveDown(0.4);
    } else {
      doc.text(`Payment: ${receipt.transaction?.paymentMethod || ""}`);
      doc.moveDown(0.4);
    }
    doc.fontSize(10).text(`Subtotal: ${fmt(receipt.subtotal)}`);
    doc.text(`Tax: ${fmt(receipt.tax?.amount || 0)}`);
    doc.fontSize(12).text(`Total: ${fmt(receipt.total)}`, { continued: false });
    doc.moveDown(1);
    doc.fontSize(8).fillColor("#666666").text("Thank you.", { align: "center" });

    doc.end();
  });
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function attachReceiptArtifactsIfEnabled(tx, { businessId, plan, transactionId, receipt }) {
  const allowed = await isFeatureEnabled(businessId, plan, "RECEIPT_GENERATOR");
  if (!allowed) {
    return {};
  }

  const receiptId = randomUUID();
  const receiptPublicToken = randomUUID();
  const { apiPublicUrl } = require("../config/env");
  const base = String(apiPublicUrl || "").replace(/\/$/, "");
  const receiptUrl = `${base}/receipts/public/${receiptPublicToken}`;

  ensureReceiptsDir();
  const buffer = await buildReceiptPdfBuffer(receipt);
  const filePath = receiptPdfPath(receiptId);
  await fs.promises.writeFile(filePath, buffer);

  await tx.transaction.update({
    where: { id: transactionId },
    data: {
      receiptId,
      receiptUrl,
      receiptPublicToken,
    },
  });

  logger.info(
    {
      event: "receiptGenerated",
      receiptType: "pdf",
      transactionId,
      receiptId,
      deliveryMethod: "link",
    },
    "receipt PDF generated"
  );

  return { receiptId, receiptUrl, receiptPublicToken };
}

async function findTransactionForPublicToken(token) {
  if (!token || String(token).length < 10) return null;
  return prisma.transaction.findFirst({
    where: { receiptPublicToken: String(token) },
    select: {
      id: true,
      businessId: true,
      receiptId: true,
      receiptUrl: true,
    },
  });
}

function fileExistsSync(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Stream PDF for public or authenticated download.
 */
async function streamReceiptPdfForTransaction(res, transactionRow) {
  if (!transactionRow?.receiptId) {
    const err = new Error("Receipt not available");
    err.statusCode = 404;
    throw err;
  }
  const p = receiptPdfPath(transactionRow.receiptId);
  if (!fileExistsSync(p)) {
    const err = new Error("Receipt file missing");
    err.statusCode = 404;
    throw err;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${transactionRow.id}.pdf"`);
  fs.createReadStream(p).pipe(res);
}

/**
 * Rebuild receipt JSON from DB (for future regeneration — not required for MVP if file exists).
 */
async function buildReceiptShapeFromTransactionId(businessId, transactionId) {
  const hydrated = await prisma.transaction.findFirst({
    where: { id: transactionId, businessId },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items: {
        include: { product: { select: { id: true, name: true, barcode: true } } },
      },
    },
  });
  if (!hydrated) return null;

  const settings = await prisma.settings.findUnique({
    where: { businessId },
    select: {
      taxEnabled: true,
      taxRate: true,
      businessName: true,
      businessEmail: true,
      businessPhone: true,
      currencySymbol: true,
    },
  });

  let subtotal = 0;
  for (const item of hydrated.items) {
    subtotal += Number(item.price) * Number(item.quantity);
  }
  subtotal = roundCurrency(subtotal);
  const taxRate = settings?.taxEnabled ? Number(settings.taxRate || 0) : 0;
  const taxAmount = roundCurrency(subtotal * (taxRate / 100));
  const total = roundCurrency(subtotal + taxAmount);

  return {
    business: {
      name: settings?.businessName || "Business",
      email: settings?.businessEmail || "",
      phone: settings?.businessPhone || "",
      currencySymbol: settings?.currencySymbol || "$",
    },
    transaction: {
      id: hydrated.id,
      paymentMethod: hydrated.paymentMethod,
      payments: hydrated.payments ?? null,
      paymentStatus: paymentStatusToApi(hydrated.paymentStatus),
      amountPaid: hydrated.amountPaid,
      balanceDue: hydrated.balanceDue,
      dueDate: hydrated.dueDate,
      dateTime: hydrated.createdAt,
      customer: hydrated.customer,
    },
    items: hydrated.items.map((item) => ({
      productName: item.product?.name || "Item",
      quantity: item.quantity,
      unitPrice: Number(item.price),
      lineTotal: roundCurrency(Number(item.price) * Number(item.quantity)),
    })),
    subtotal,
    tax: {
      enabled: Boolean(settings?.taxEnabled),
      rate: taxRate,
      amount: taxAmount,
    },
    total,
  };
}

module.exports = {
  buildReceiptPdfBuffer,
  attachReceiptArtifactsIfEnabled,
  findTransactionForPublicToken,
  streamReceiptPdfForTransaction,
  buildReceiptShapeFromTransactionId,
  receiptPdfPath,
};
