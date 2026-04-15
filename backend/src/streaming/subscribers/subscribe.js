/**
 * Re-export bus subscribe for external modules.
 */
const { getEventBus } = require("../eventBus/eventBus");

function subscribe(type, handler) {
  return getEventBus().subscribe(type, handler);
}

module.exports = {
  subscribe,
  getEventBus,
};
