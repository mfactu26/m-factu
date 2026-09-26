const STRIPE_API = "https://api.stripe.com/v1";

function assertStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_NOT_CONFIGURED");
}

function append(params, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => append(params, key + "[" + i + "]", v));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([k,v]) => append(params, key + "[" + k + "]", v));
    return;
  }
  params.append(key, String(value));
}

async function stripeRequest(method, path, body, idempotencyKey) {
  assertStripe();
  const headers = {
    Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY,
    "Stripe-Version": "2026-08-26.preview"
  };
  let payload;
  if (body) {
    const params = new URLSearchParams();
    Object.entries(body).forEach(([k,v]) => append(params,k,v));
    payload = params.toString();
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const r = await fetch(STRIPE_API + path, {method, headers, body: payload});
  const data = await r.json();
  if (!r.ok) {
    const err = new Error(data?.error?.message || "STRIPE_ERROR");
    err.code = data?.error?.code || "STRIPE_ERROR";
    err.status = r.status;
    throw err;
  }
  return data;
}

function feeCents(turnoverCents) {
  const cents = Number(turnoverCents);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("INVALID_TURNOVER");
  return Math.round(cents * 350 / 10000);
}

module.exports = { stripeRequest, feeCents };
