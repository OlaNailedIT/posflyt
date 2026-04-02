const prisma = require("../config/prisma");

async function listCustomers(businessId) {
  return prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

async function createCustomer(businessId, payload) {
  return prisma.customer.create({
    data: {
      businessId,
      ...payload,
    },
  });
}

async function updateCustomer(businessId, customerId, payload) {
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    select: { id: true },
  });
  if (!existing) {
    const error = new Error("Customer not found");
    error.statusCode = 404;
    throw error;
  }
  return prisma.customer.update({
    where: { id: customerId },
    data: payload,
  });
}

module.exports = { listCustomers, createCustomer, updateCustomer };
