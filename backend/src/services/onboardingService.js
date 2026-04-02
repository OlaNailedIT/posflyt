const prisma = require("../config/prisma");

async function ensureOnboarding(businessId) {
  const existing = await prisma.onboardingProgress.findUnique({ where: { businessId } });
  if (existing) return existing;
  return prisma.onboardingProgress.create({
    data: { businessId },
  });
}

async function markFirstProductDone(businessId) {
  await ensureOnboarding(businessId);
  return prisma.onboardingProgress.update({
    where: { businessId },
    data: { firstProductDone: true, lastActiveAt: new Date() },
  });
}

async function markFirstSaleDone(businessId) {
  await ensureOnboarding(businessId);
  return prisma.onboardingProgress.update({
    where: { businessId },
    data: { firstSaleDone: true, lastActiveAt: new Date() },
  });
}

async function getOnboardingStatus(businessId) {
  const status = await ensureOnboarding(businessId);
  const completed = Number(status.firstProductDone) + Number(status.firstSaleDone);
  const progress = Math.round((completed / 2) * 100);
  const reminders = [];
  const inactiveDays = (Date.now() - new Date(status.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
  if (!status.firstProductDone) reminders.push("Add your first product to start selling.");
  if (!status.firstSaleDone) reminders.push("Complete your first sale to finish setup.");
  if (inactiveDays >= 7) reminders.push("You have been inactive for a while. Continue setup to stay on track.");
  return {
    ...status,
    progress,
    reminders,
  };
}

async function markBusinessActive(businessId) {
  await ensureOnboarding(businessId);
  return prisma.onboardingProgress.update({
    where: { businessId },
    data: { lastActiveAt: new Date() },
  });
}

module.exports = {
  ensureOnboarding,
  markFirstProductDone,
  markFirstSaleDone,
  getOnboardingStatus,
  markBusinessActive,
};
