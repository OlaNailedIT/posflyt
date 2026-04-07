const prisma = require("../config/prisma");
const { sendOk, sendError } = require("../utils/http");

async function getSyncDiagnostics(req, res, next) {
  try {
    const businessId = req.auth?.businessId;
    if (!businessId) {
      return sendError(res, {
        statusCode: 400,
        code: "MISSING_BUSINESS",
        message: "Business context required",
        location: "controllers/debugController.getSyncDiagnostics",
      });
    }

    const totalTransactions = await prisma.transaction.count({
      where: { businessId },
    });

    const recentTransactions = await prisma.transaction.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        total: true,
        createdAt: true,
        syncStatus: true,
        paymentMethod: true,
      },
    });

    return sendOk(res, {
      totalTransactions,
      recentTransactions,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getSyncDiagnostics };
