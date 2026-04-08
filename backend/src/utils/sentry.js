const Sentry = require("@sentry/node");
const { sentryDsn, nodeEnv, sentryRelease, sentryTracesSampleRate } = require("../config/env");

const sentryEnabled = Boolean(sentryDsn);

function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: sentryDsn,
    environment: nodeEnv,
    release: sentryRelease || undefined,
    tracesSampleRate: sentryTracesSampleRate,
  });
}

function captureException(error, context = {}) {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag("request_id", context.requestId);
    if (context.location) scope.setTag("location", context.location);
    if (context.code) scope.setTag("error_code", context.code);
    if (context.userId) scope.setUser({ id: String(context.userId) });
    Sentry.captureException(error);
  });
}

module.exports = { initSentry, captureException, sentryEnabled };
