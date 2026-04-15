const prisma = require("../config/prisma");

function toCsv(headers, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n");
}

async function exportTransactionsCsv(businessId) {
  const data = await prisma.transaction.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      totalAmount: true,
      paymentMethod: true,
      payments: true,
      createdAt: true,
      customerId: true,
      userId: true,
    },
  });
  return toCsv(
    ["id", "total_amount", "payment_method", "payments_json", "created_at", "customer_id", "user_id"],
    data.map((t) => [
      t.id,
      t.totalAmount,
      t.paymentMethod,
      t.payments != null ? JSON.stringify(t.payments) : "",
      t.createdAt.toISOString(),
      t.customerId || "",
      t.userId,
    ])
  );
}

async function exportProductsCsv(businessId) {
  const data = await prisma.product.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      price: true,
      sellingPrice: true,
      costPrice: true,
      unitType: true,
      pricePerUnit: true,
      stock: true,
      lowStockThreshold: true,
      barcode: true,
    },
  });
  return toCsv(
    [
      "id",
      "name",
      "price",
      "selling_price",
      "cost_price",
      "unit_type",
      "price_per_unit",
      "stock",
      "low_stock_threshold",
      "barcode",
    ],
    data.map((p) => [
      p.id,
      p.name,
      p.price,
      p.sellingPrice,
      p.costPrice,
      p.unitType || "unit",
      p.pricePerUnit ?? "",
      p.stock,
      p.lowStockThreshold,
      p.barcode || "",
    ])
  );
}

async function exportCustomersCsv(businessId) {
  const data = await prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
  });
  return toCsv(
    ["id", "name", "phone", "email", "created_at"],
    data.map((c) => [c.id, c.name, c.phone || "", c.email || "", c.createdAt.toISOString()])
  );
}

module.exports = { exportTransactionsCsv, exportProductsCsv, exportCustomersCsv };
