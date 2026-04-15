/**
 * Simulates partial outcomes: success path vs late rejection (in-process).
 */

async function succeedThenFailResponse() {
  return { committed: true, clientView: "timeout_error" };
}

/** First continuation wins; second rejects (partition-ish). */
async function partitionRace(a, b) {
  return Promise.race([
    a().then((v) => ({ source: "a", ok: true, v })),
    b().then((v) => ({ source: "b", ok: true, v })),
  ]);
}

module.exports = {
  succeedThenFailResponse,
  partitionRace,
};
