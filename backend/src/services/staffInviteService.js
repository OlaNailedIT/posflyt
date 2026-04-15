const { randomBytes } = require("crypto");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const { hashPassword } = require("../utils/password");
const { sanitizeDisplayName } = require("../utils/sanitize");
const { normalizePhoneDigits, waMePathDigits } = require("../utils/phone");
const { logAudit } = require("./auditService");
const { appBaseUrl } = require("../config/env");

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function buildInvitePath(token) {
  const base = String(appBaseUrl || "http://localhost:5173").replace(/\/$/, "");
  return `${base}/invite/${token}`;
}

function buildWhatsAppUrl(normalizedPhoneDigits, invitePath, { businessName, fullName, roleLabel }) {
  const waDigits = waMePathDigits(normalizedPhoneDigits);
  const lines = [
    `Hi ${fullName.split(/\s+/)[0] || fullName} 👋`,
    "",
    `You've been added to POSflyt as ${roleLabel} at ${businessName}.`,
    "",
    `👉 Complete setup here:`,
    invitePath,
    "",
    "This link expires in 7 days.",
  ];
  const text = encodeURIComponent(lines.join("\n"));
  return `https://wa.me/${waDigits}?text=${text}`;
}

/**
 * @param {string} businessId
 * @param {{ fullName: string, phone: string, role: 'CASHIER'|'MANAGER', storeId?: string|null }} payload
 * @param {string} adminUserId
 */
async function createStaffInvite(businessId, payload, adminUserId) {
  const phone = normalizePhoneDigits(payload.phone);
  if (!phone) {
    const err = new Error("Enter a valid phone number with country code");
    err.statusCode = 400;
    err.code = "INVALID_PHONE";
    throw err;
  }

  const fullName = sanitizeDisplayName(payload.fullName, 120);
  if (!fullName || fullName.length < 2) {
    const err = new Error("Name is required");
    err.statusCode = 400;
    throw err;
  }

  if (payload.role !== "CASHIER" && payload.role !== "MANAGER") {
    const err = new Error("Invalid role");
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await prisma.user.findFirst({
    where: { phone },
    select: { id: true, businessId: true },
  });
  if (existingUser) {
    const err = new Error("This phone is already registered in POSflyt");
    err.statusCode = 409;
    err.code = "PHONE_ALREADY_REGISTERED";
    throw err;
  }

  const pending = await prisma.staffInvite.findFirst({
    where: {
      businessId,
      phone,
      used: false,
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    const err = new Error("An invite is already pending for this phone. Wait for it to expire or complete setup.");
    err.statusCode = 409;
    err.code = "INVITE_PENDING";
    throw err;
  }

  let storeId = payload.storeId || null;
  if (storeId) {
    const store = await prisma.store.findFirst({
      where: { id: storeId, businessId },
      select: { id: true },
    });
    if (!store) {
      const err = new Error("Store not found");
      err.statusCode = 400;
      throw err;
    }
  } else {
    const first = await prisma.store.findFirst({
      where: { businessId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    storeId = first?.id ?? null;
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const invite = await prisma.staffInvite.create({
    data: {
      businessId,
      phone,
      fullName,
      role: payload.role,
      token,
      expiresAt,
      storeId,
    },
  });

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true },
  });
  const store = storeId
    ? await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } })
    : null;

  const invitePath = buildInvitePath(token);
  const roleLabel = payload.role === "MANAGER" ? "MANAGER" : "CASHIER";
  const whatsappUrl = buildWhatsAppUrl(phone, invitePath, {
    businessName: business?.name || "your store",
    fullName,
    roleLabel,
  });

  await logAudit({
    businessId,
    userId: adminUserId,
    action: "STAFF_INVITE_CREATED",
    metadata: {
      inviteId: invite.id,
      role: payload.role,
      phoneSuffix: phone.slice(-4),
    },
  });

  return {
    inviteId: invite.id,
    expiresAt: invite.expiresAt.toISOString(),
    inviteUrl: invitePath,
    whatsappUrl,
    storeName: store?.name || null,
    businessName: business?.name || null,
  };
}

async function getInvitePreview(token) {
  if (!token || String(token).length < 16) {
    const err = new Error("Invalid invite link");
    err.statusCode = 404;
    err.code = "INVITE_NOT_FOUND";
    throw err;
  }

  const invite = await prisma.staffInvite.findUnique({
    where: { token: String(token) },
    include: {
      business: { select: { name: true } },
      store: { select: { name: true } },
    },
  });

  if (!invite) {
    const err = new Error("This invite link is not valid");
    err.statusCode = 404;
    err.code = "INVITE_NOT_FOUND";
    throw err;
  }
  if (invite.used) {
    const err = new Error("This invite was already used. Ask your manager for a new link.");
    err.statusCode = 410;
    err.code = "INVITE_USED";
    throw err;
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    const err = new Error("This invite has expired. Ask your manager for a new link.");
    err.statusCode = 410;
    err.code = "INVITE_EXPIRED";
    throw err;
  }

  return {
    fullName: invite.fullName,
    role: invite.role,
    businessName: invite.business.name,
    storeName: invite.store?.name || null,
    phoneHint: `••••${invite.phone.slice(-4)}`,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

/**
 * @param {string} token
 * @param {string} pin
 */
async function acceptStaffInvite(token, pin) {
  const preview = await prisma.staffInvite.findUnique({
    where: { token: String(token) },
  });

  if (!preview) {
    const err = new Error("This invite link is not valid");
    err.statusCode = 404;
    err.code = "INVITE_NOT_FOUND";
    throw err;
  }
  if (preview.used) {
    const err = new Error("This invite was already used");
    err.statusCode = 410;
    err.code = "INVITE_USED";
    throw err;
  }
  if (preview.expiresAt.getTime() < Date.now()) {
    const err = new Error("This invite has expired");
    err.statusCode = 410;
    err.code = "INVITE_EXPIRED";
    throw err;
  }

  const phone = preview.phone;

  const clash = await prisma.user.findFirst({
    where: { phone },
    select: { id: true },
  });
  if (clash) {
    const err = new Error("This phone is already registered. Sign in with phone and PIN.");
    err.statusCode = 409;
    err.code = "PHONE_TAKEN";
    throw err;
  }

  const email = `staff_${randomUUID()}@invite.posflyt.internal`;
  const hashed = await hashPassword(pin);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        businessId: preview.businessId,
        name: sanitizeDisplayName(preview.fullName, 120),
        email,
        phone,
        password: hashed,
        role: preview.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        businessId: true,
        phone: true,
      },
    });

    await tx.staffInvite.update({
      where: { id: preview.id },
      data: { used: true },
    });

    return u;
  });

  await logAudit({
    businessId: preview.businessId,
    userId: user.id,
    action: "STAFF_INVITE_ACCEPTED",
    metadata: {
      inviteId: preview.id,
      role: user.role,
    },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      business_id: user.businessId,
      phone: user.phone,
    },
  };
}

module.exports = {
  createStaffInvite,
  getInvitePreview,
  acceptStaffInvite,
  buildInvitePath,
  INVITE_TTL_MS,
};
