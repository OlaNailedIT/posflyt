/**
 * Phase 6.3 — environment tier for Prisma CLI actions (dev → staging → prod promotion).
 * Set MIGRATION_ENV=development|staging|production to override NODE_ENV when needed (e.g. CI).
 */
const MIGRATION_POLICY = {
  development: {
    allowDev: true,
    /** Local apply of committed migrations (required after migrate dev or for baseline). */
    allowDeploy: true,
    allowReset: true,
  },
  staging: {
    allowDev: false,
    allowDeploy: true,
    allowReset: false,
  },
  production: {
    allowDev: false,
    allowDeploy: true,
    allowReset: false,
  },
};

/**
 * Resolves promotion tier: explicit MIGRATION_ENV wins, then NODE_ENV / CI heuristics.
 * @returns {'development'|'staging'|'production'}
 */
function getMigrationTier() {
  const explicit = process.env.MIGRATION_ENV;
  if (explicit === "development" || explicit === "staging" || explicit === "production") {
    return explicit;
  }

  const nodeEnv = process.env.NODE_ENV || "development";
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "staging") return "staging";
  /** CI test runs use ephemeral DB like staging: deploy-only validation, no migrate dev. */
  if (process.env.CI === "true" && nodeEnv === "test") return "staging";

  return "development";
}

function getPolicy() {
  const tier = getMigrationTier();
  return MIGRATION_POLICY[tier] || MIGRATION_POLICY.development;
}

/**
 * @param {'migrate dev'|'migrate deploy'|'migrate reset'|'db push'} action
 */
function assertMigrationAction(action) {
  const tier = getMigrationTier();
  const policy = MIGRATION_POLICY[tier];
  if (!policy) {
    throw new Error(`Unknown migration tier: ${tier}`);
  }

  const rules = {
    "migrate dev": policy.allowDev,
    "migrate deploy": policy.allowDeploy,
    "migrate reset": policy.allowReset,
    "db push": policy.allowDev,
  };

  if (!Object.prototype.hasOwnProperty.call(rules, action)) {
    return;
  }
  if (!rules[action]) {
    throw new Error(
      `Prisma action "${action}" is not allowed in "${tier}" environment (MIGRATION_ENV=${process.env.MIGRATION_ENV || "unset"}, NODE_ENV=${process.env.NODE_ENV || "unset"})`
    );
  }
}

/**
 * Map argv after script to a single logical Prisma migration action, if any.
 * @param {string[]} argvSlice process.argv.slice(2)
 * @returns {'migrate dev'|'migrate deploy'|'migrate reset'|'db push'|null}
 */
function detectMigrationAction(argvSlice) {
  const s = argvSlice.join(" ");
  if (s.includes("migrate reset")) return "migrate reset";
  if (s.includes("migrate deploy")) return "migrate deploy";
  if (s.includes("migrate dev")) return "migrate dev";
  if (s.includes("db push")) return "db push";
  return null;
}

module.exports = {
  getMigrationTier,
  getPolicy,
  assertMigrationAction,
  detectMigrationAction,
  MIGRATION_POLICY,
};
