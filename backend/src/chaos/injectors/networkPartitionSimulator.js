/**
 * In-process simulation of "POST ok / GET fails" style asymmetry.
 */
function postOkGetFail(getShouldFail = true) {
  const post = { ok: true, id: "simulated" };
  const get = getShouldFail ? { error: "PARTITION_GET_TIMEOUT" } : { ok: true };
  return { post, get };
}

module.exports = {
  postOkGetFail,
};
