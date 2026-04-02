const { z } = require("zod");
const prisma = require("../config/prisma");
const { sendOk, sendError } = require("../utils/http");

const issueSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(5000),
});

function getHelp(_req, res) {
  return sendOk(res, {
    quickStart: [
      "Add your first product in Inventory.",
      "Use POS page to make a sale.",
      "Check Dashboard for analytics and alerts.",
    ],
    docs: [
      { title: "Inventory Guide", path: "/help#inventory" },
      { title: "POS Guide", path: "/help#pos" },
      { title: "Offline Sync", path: "/help#offline" },
    ],
  });
}

async function postIssue(req, res, next) {
  try {
    const payload = issueSchema.parse(req.body);
    const data = await prisma.issueReport.create({
      data: {
        businessId: req.auth.businessId,
        userId: req.auth.userId,
        subject: payload.subject,
        description: payload.description,
      },
    });
    return sendOk(res, data, 201);
  } catch (error) {
    if (error.name === "ZodError") {
      return sendError(res, {
        statusCode: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        location: "controllers/supportController.postIssue",
        details: { requestId: req.requestId, errors: error.issues },
      });
    }
    return next(error);
  }
}

module.exports = { getHelp, postIssue };
