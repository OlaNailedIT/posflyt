/**
 * Calendar "today" bounds for reporting (Phase 7.10.2 micro-hardening).
 * UTC is the default; IANA zones (e.g. Africa/Lagos) use Intl (no extra deps).
 * All returned `Date` values are absolute UTC instants; `dateKey` is YYYY-MM-DD in that zone.
 */

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/**
 * @param {Date} [anchor]
 * @param {string} [businessTimeZone] IANA name, e.g. "UTC", "Africa/Lagos"
 */
function getBusinessDayRange(anchor = new Date(), businessTimeZone = "UTC") {
  const tz = businessTimeZone && String(businessTimeZone).trim() ? String(businessTimeZone).trim() : "UTC";
  if (tz === "UTC" || tz === "Etc/UTC") {
    const from = startOfUtcDay(anchor);
    const to = endOfUtcDay(anchor);
    return {
      from,
      to,
      dateKey: from.toISOString().slice(0, 10),
      timeZone: "UTC",
    };
  }

  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateKey = dayFmt.format(anchor);

  const t0 = anchor.getTime() - 48 * 60 * 60 * 1000;
  const t1 = anchor.getTime() + 48 * 60 * 60 * 1000;

  let fromMs = null;
  for (let t = t0; t <= t1; t += 60 * 1000) {
    if (dayFmt.format(new Date(t)) === dateKey) {
      fromMs = t;
      break;
    }
  }

  if (fromMs == null) {
    const from = startOfUtcDay(anchor);
    const to = endOfUtcDay(anchor);
    return {
      from,
      to,
      dateKey: from.toISOString().slice(0, 10),
      timeZone: "UTC",
      timeZoneFallback: true,
      requestedTimeZone: tz,
    };
  }

  while (fromMs > t0 && dayFmt.format(new Date(fromMs - 60 * 1000)) === dateKey) {
    fromMs -= 60 * 1000;
  }

  let m = fromMs;
  while (m <= t1 + 2 * 24 * 60 * 60 * 1000 && dayFmt.format(new Date(m)) === dateKey) {
    m += 60 * 1000;
  }
  const to = new Date(m - 1);

  return {
    from: new Date(fromMs),
    to,
    dateKey,
    timeZone: tz,
  };
}

module.exports = {
  getBusinessDayRange,
  startOfUtcDay,
  endOfUtcDay,
};
