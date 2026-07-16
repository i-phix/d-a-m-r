const {
  getTariffPlan: getTariffPlanModel,
  getCredit: getCreditModel,
  getUnitMeta: getUnitMetaModel,
} = require("../utils/damrSchemas");

const DEFAULT_PLAN = {
  _id: null,
  name: "Default (unconfigured)",
  bands: [{ upTo: null, rate: 80 }],
  minimumCharge: 0,
  sewerageRate: 0.75,
  techFee: 150,
  penaltyEnabled: false,
  penaltyType: "percentage",
  penaltyValue: 0,
  dueDateOffsetDays: 15,
};

async function getActiveTariffPlan(facilityId, { blockId, unitType } = {}) {
  if (!facilityId) return DEFAULT_PLAN;
  const TariffPlan = getTariffPlanModel();

  const candidates = [];
  if (unitType) {
    candidates.push({ facilityId, unitType, active: true });
  }
  if (blockId) {
    candidates.push({ facilityId, blockId, unitType: null, active: true });
  }
  candidates.push({ facilityId, blockId: null, unitType: null, active: true });

  for (const query of candidates) {
    const plan = await TariffPlan.findOne(query).sort({ createdAt: -1 }).lean();
    if (plan) return plan;
  }
  return DEFAULT_PLAN;
}
function calcTieredCharge(consumption, bands) {
  let remaining = Math.max(0, Number(consumption) || 0);
  let charge = 0;
  let lowerBound = 0;
  const lines = [];

  for (const band of bands) {
    if (remaining <= 0) break;
    const upTo = band.upTo == null ? Infinity : Number(band.upTo);
    const bandSize = upTo - lowerBound;
    const usedInBand = Math.min(remaining, bandSize);

    if (usedInBand > 0) {
      const amount = usedInBand * band.rate;
      charge += amount;
      lines.push({
        from: lowerBound,
        to: upTo === Infinity ? null : upTo,
        units: usedInBand,
        rate: band.rate,
        amount,
      });
      remaining -= usedInBand;
    }
    lowerBound = upTo;
  }

  return { charge, lines };
}

async function getArrears(Invoice, residentId) {
  const unpaid = await Invoice.find({
    residentId,
    status: { $in: ["Unpaid", "Overdue", "Partial"] },
  }).lean();
  return unpaid.reduce(
    (sum, inv) => sum + (inv.balance ?? inv.totalAmount ?? 0),
    0,
  );
}

/** Read-only preview of a resident's open credit balance. */
async function previewCredits(residentId) {
  if (!residentId) return { total: 0, credits: [] };
  const Credit = getCreditModel();
  const credits = await Credit.find({
    residentId,
    status: "open",
    remainingAmount: { $gt: 0 },
  })
    .sort({ createdAt: 1 })
    .lean();
  const total = credits.reduce((sum, c) => sum + c.remainingAmount, 0);
  return { total, credits };
}
async function applyCreditsToInvoice(residentId, invoiceId, amountToApply) {
  if (!residentId || !amountToApply || amountToApply <= 0) return 0;
  const Credit = getCreditModel();
  const { credits } = await previewCredits(residentId);

  let remaining = amountToApply;
  let applied = 0;
  for (const credit of credits) {
    if (remaining <= 0) break;
    const take = Math.min(credit.remainingAmount, remaining);
    const newRemaining = credit.remainingAmount - take;
    await Credit.findByIdAndUpdate(credit._id, {
      remainingAmount: newRemaining,
      status: newRemaining <= 0 ? "applied" : "open",
      $push: { appliedToInvoiceIds: invoiceId },
    });
    remaining -= take;
    applied += take;
  }
  return applied;
}

function getDueDate(periodEnd, dueDateOffsetDays = 15) {
  const d = new Date(periodEnd);
  d.setDate(d.getDate() + Number(dueDateOffsetDays || 0));
  return d;
}

/**
 * Full invoice calculation for one billing period.
 * @returns {{ ratePerUnit, totalAmount, dueDate, tariffPlanId, breakdown }}
 */

async function resolveBlockId(unitId) {
  if (!unitId) return null;
  const UnitMeta = getUnitMetaModel();
  const link = await UnitMeta.findOne({ unitId }).lean();
  return link?.blockId || null;
}

async function calcInvoice({
  facilityId,
  residentId,
  consumption,
  periodEnd,
  arrears: arrearsOverride,
  Invoice,
  blockId,
  unitId,
  unitType,
}) {
  const resolvedBlockId = blockId || (await resolveBlockId(unitId));
  const plan = await getActiveTariffPlan(facilityId, {
    blockId: resolvedBlockId,
    unitType,
  });

  const { charge: rawWaterCharge, lines } = calcTieredCharge(
    consumption,
    plan.bands,
  );
  const minimumChargeApplied = rawWaterCharge < (plan.minimumCharge || 0);
  const waterCharge = minimumChargeApplied
    ? plan.minimumCharge
    : rawWaterCharge;

  const sewerageCharge = waterCharge * (plan.sewerageRate || 0);
  const techFee = plan.techFee || 0;

  const arrears =
    arrearsOverride != null
      ? arrearsOverride
      : Invoice && residentId
        ? await getArrears(Invoice, residentId)
        : 0;

  const subtotal = waterCharge + sewerageCharge + techFee + arrears;

  const { total: creditsAvailable } = await previewCredits(residentId);
  const creditsApplied = Math.min(creditsAvailable, subtotal);

  const totalAmount = Math.max(0, subtotal - creditsApplied);
  const ratePerUnit =
    consumption > 0
      ? Number((waterCharge / consumption).toFixed(4))
      : plan.bands[0]?.rate || 0;

  return {
    ratePerUnit,
    totalAmount,
    dueDate: periodEnd ? getDueDate(periodEnd, plan.dueDateOffsetDays) : null,
    tariffPlanId: plan._id || null,
    paybillShortCode: plan.paybillShortCode || null,
    creditsApplied,
    breakdown: {
      bands: lines,
      waterCharge,
      sewerageCharge,
      techFee,
      minimumChargeApplied,
      arrears,
      creditsApplied,
      penalty: 0,
    },
  };
}

async function calcLateFee(invoice) {
  if (invoice.penaltyApplied) return null;

  const plan = await getActiveTariffPlan(invoice.facilityId);
  if (!plan.penaltyEnabled || !plan.penaltyValue) return null;

  const base = invoice.balance ?? invoice.totalAmount;
  const penalty =
    plan.penaltyType === "flat"
      ? plan.penaltyValue
      : base * (plan.penaltyValue / 100);

  if (!penalty || penalty <= 0) return null;

  const totalAmount = (invoice.totalAmount || 0) + penalty;
  const balance = (invoice.balance ?? invoice.totalAmount ?? 0) + penalty;

  return {
    penalty,
    update: {
      totalAmount,
      balance,
      penaltyApplied: true,
      "breakdown.penalty": penalty,
    },
  };
}

module.exports = {
  DEFAULT_PLAN,
  getActiveTariffPlan,
  calcTieredCharge,
  getArrears,
  previewCredits,
  applyCreditsToInvoice,
  getDueDate,
  calcInvoice,
  calcLateFee,
  resolveBlockId,
};
