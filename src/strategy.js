const BB_LENGTH = 20;
const BB_DEVIATION = 1.4;
const RISK_REWARD = 1.7;
const IST_OFFSET = 330 * 60 * 1000;

export function parseBars(payload) {
  const data = Array.isArray(payload)
    ? payload
    : payload?.bars ?? [];

  return data.map(bar => ({
    time: Number(bar.openTime ?? bar.time ?? bar.timestamp),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close)
  }))
  .filter(bar =>
    Object.values(bar).every(Number.isFinite)
  )
  .sort((a, b) => a.time - b.time);
}

function isSession(timestamp) {
  const date = new Date(timestamp + IST_OFFSET);
  const minutes =
    date.getUTCHours() * 60 + date.getUTCMinutes();

  return (
    (minutes >= 300 && minutes < 540) ||
    (minutes >= 1020 && minutes < 1260)
  );
}

function calculateBands(closes) {
  if (closes.length < BB_LENGTH) return null;

  const values = closes.slice(-BB_LENGTH);
  const average =
    values.reduce((sum, value) => sum + value, 0) /
    BB_LENGTH;

  const variance =
    values.reduce(
      (sum, value) => sum + (value - average) ** 2,
      0
    ) / BB_LENGTH;

  const deviation = Math.sqrt(variance) * BB_DEVIATION;

  return {
    lower: average - deviation,
    upper: average + deviation
  };
}

export function signalFor(bars, now = Date.now()) {
  if (bars.length < BB_LENGTH + 1) return null;

  const previous = bars[bars.length - 2];
  const current = bars[bars.length - 1];

  const bands = calculateBands(
    bars.slice(0, -1).map(bar => bar.close)
  );

  if (!bands || !isSession(now)) return null;

  const buy =
    previous.close > previous.open &&
    previous.high < bands.lower &&
    current.close > current.open &&
    current.close > previous.high;

  const sell =
    previous.close < previous.open &&
    previous.low > bands.upper &&
    current.close < current.open &&
    current.close < previous.low;

  if (buy) {
    const entry = previous.high;
    const sl = previous.low;

    return {
      side: "BUY",
      entry,
      sl,
      tp: entry + (entry - sl) * RISK_REWARD,
      barTime: current.time
    };
  }

  if (sell) {
    const entry = previous.low;
    const sl = previous.high;

    return {
      side: "SELL",
      entry,
      sl,
      tp: entry - (sl - entry) * RISK_REWARD,
      barTime: current.time
    };
  }

  return null;
}
