/**
 * Modular monolith domain barrels (Phase 9).
 * Prefer importing from `../domains/<name>` when adding new cross-domain code.
 */
module.exports = {
  auth: require("./auth"),
  billing: require("./billing"),
  sync: require("./sync"),
  analytics: require("./analytics"),
  platform: require("./platform"),
};
