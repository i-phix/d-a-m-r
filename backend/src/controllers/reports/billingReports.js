const {
  getInvoice: getInvoiceModel,
  getMeter: getMeterModel,
  getReading: getReadingModel,
  getFlag: getFlagModel,
} = require("../../utils/damrSchemas");
const AGEING_BUCKETS = [
  { label: "0-30", min: 0, max: 30 },
  { label: "31-60", min: 31, max: 60 },
  { label: "61-90", min: 61, max: 90 },
  { label: "90+", min: 91, max: Infinity },
];
async function refreshOverdueStatus(Invoice) {
  const now = new Date();
  await Invoice.updateMany(
    {
      status: "Unpaid",
      $or: [
        { dueDate: { $ne: null, $lt: now } },
        { dueDate: null, periodEnd: { $lt: now } },
      ],
    },
    { $set: { status: "Overdue" } },
  );
}

function amountDueOf(invoice) {
  return (
    invoice.balance ??
    Math.max(0, (invoice.totalAmount || 0) - (invoice.amountPaid || 0))
  );
}

function daysOverdueOf(invoice, now) {
  const referenceDate = invoice.dueDate || invoice.periodEnd;
  return Math.max(
    0,
    Math.floor((now - new Date(referenceDate)) / (1000 * 60 * 60 * 24)),
  );
}

function scopeFacility(req, filter) {
  if (req.user.role === "editor") {
    filter.facilityId = req.user.facilityId;
  } else if (req.query.facilityId) {
    filter.facilityId = req.query.facilityId;
  }
  return filter;
}
const getArrearsAgeing = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    await refreshOverdueStatus(Invoice);

    const filter = scopeFacility(req, { status: "Overdue" });
    const invoices = await Invoice.find(filter)
      .populate("facilityId", "name")
      .lean();
    const now = new Date();

    const buckets = AGEING_BUCKETS.map((b) => ({
      label: b.label,
      count: 0,
      amount: 0,
    }));
    const byFacility = new Map();

    for (const invoice of invoices) {
      const amountDue = amountDueOf(invoice);
      if (amountDue <= 0) continue;

      const daysOverdue = daysOverdueOf(invoice, now);
      const bucketDef =
        AGEING_BUCKETS.find(
          (b) => daysOverdue >= b.min && daysOverdue <= b.max,
        ) || AGEING_BUCKETS[AGEING_BUCKETS.length - 1];
      const bucket = buckets.find((b) => b.label === bucketDef.label);
      bucket.count += 1;
      bucket.amount += amountDue;

      const facKey = invoice.facilityId
        ? String(invoice.facilityId._id)
        : "unassigned";
      if (!byFacility.has(facKey)) {
        byFacility.set(facKey, {
          facilityId: facKey === "unassigned" ? null : facKey,
          facilityName: invoice.facilityId?.name || "Unassigned",
          buckets: AGEING_BUCKETS.map((b) => ({
            label: b.label,
            count: 0,
            amount: 0,
          })),
          totalOutstanding: 0,
        });
      }
      const facEntry = byFacility.get(facKey);
      const facBucket = facEntry.buckets.find(
        (b) => b.label === bucketDef.label,
      );
      facBucket.count += 1;
      facBucket.amount += amountDue;
      facEntry.totalOutstanding += amountDue;
    }

    const totalOutstanding = buckets.reduce((sum, b) => sum + b.amount, 0);

    return res.status(200).send({
      message: "Arrears ageing fetched successfully",
      buckets,
      totalOutstanding,
      byFacility: Array.from(byFacility.values()).sort(
        (a, b) => b.totalOutstanding - a.totalOutstanding,
      ),
    });
  } catch (err) {
    console.error("Error in getArrearsAgeing:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getDefaultersList = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    await refreshOverdueStatus(Invoice);

    const { sortBy = "amount", order = "desc" } = req.query;
    const filter = scopeFacility(req, { status: "Overdue" });

    const invoices = await Invoice.find(filter)
      .populate("residentId", "name phone email")
      .populate("unitId", "name")
      .populate("facilityId", "name")
      .lean();

    const now = new Date();
    const byResident = new Map();

    for (const invoice of invoices) {
      if (!invoice.residentId) continue;
      const key = String(invoice.residentId._id);
      const amountDue = amountDueOf(invoice);
      const daysOverdue = daysOverdueOf(invoice, now);

      if (!byResident.has(key)) {
        byResident.set(key, {
          residentId: key,
          residentName: invoice.residentId.name,
          phone: invoice.residentId.phone,
          email: invoice.residentId.email,
          unitName: invoice.unitId?.name || null,
          facilityName: invoice.facilityId?.name || null,
          invoiceCount: 0,
          totalDue: 0,
          maxDaysOverdue: 0,
          invoiceIds: [],
        });
      }
      const entry = byResident.get(key);
      entry.invoiceCount += 1;
      entry.totalDue += amountDue;
      entry.maxDaysOverdue = Math.max(entry.maxDaysOverdue, daysOverdue);
      entry.invoiceIds.push(invoice._id);
    }

    const field = sortBy === "days" ? "maxDaysOverdue" : "totalDue";
    const defaulters = Array.from(byResident.values()).sort((a, b) =>
      order === "asc" ? a[field] - b[field] : b[field] - a[field],
    );

    return res.status(200).send({
      message: "Defaulters fetched successfully",
      defaulters,
      total: defaulters.length,
    });
  } catch (err) {
    console.error("Error in getDefaultersList:", err);
    return res.status(400).send({ error: err.message });
  }
};
const getDashboardStats = async (req, res) => {
  try {
    const Meter = getMeterModel();
    const Reading = getReadingModel();
    const Flag = getFlagModel();
    const Invoice = getInvoiceModel();

    const facilityFilter = scopeFacility(req, {});

    const [
      totalMeters,
      totalReadings,
      openFlags,
      resolvedFlags,
      totalInvoices,
      paidAgg,
      unpaidInvoices,
    ] = await Promise.all([
      Meter.countDocuments(facilityFilter),
      Reading.countDocuments(facilityFilter),
      Flag.countDocuments({ ...facilityFilter, status: { $ne: "resolved" } }),
      Flag.countDocuments({ ...facilityFilter, status: "resolved" }),
      Invoice.countDocuments(facilityFilter),
      Invoice.aggregate([
        { $match: { ...facilityFilter, status: "Paid" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: "$amountPaid" },
          },
        },
      ]),
      Invoice.countDocuments({ ...facilityFilter, status: { $ne: "Paid" } }),
    ]);

    const paidInvoices = paidAgg[0]?.count || 0;
    const totalRevenue = paidAgg[0]?.revenue || 0;

    // Last-6-months readings trend via aggregation rather than pulling every
    // reading document into memory.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyAgg = await Reading.aggregate([
      { $match: { ...facilityFilter, readingDate: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { y: { $year: "$readingDate" }, m: { $month: "$readingDate" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return {
        name: d.toLocaleString("default", { month: "short" }),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        count: 0,
      };
    });
    monthlyAgg.forEach((row) => {
      const slot = months.find(
        (m) => m.year === row._id.y && m.month === row._id.m,
      );
      if (slot) slot.count = row.count;
    });

    return res.status(200).send({
      message: "Dashboard stats fetched successfully",
      totalMeters,
      totalReadings,
      openFlags,
      resolvedFlags,
      totalInvoices,
      paidInvoices,
      unpaidInvoices,
      totalRevenue,
      monthlyReadings: months.map((m) => ({ name: m.name, Readings: m.count })),
      flagBreakdown: [
        { name: "Open", value: openFlags },
        { name: "Resolved", value: resolvedFlags },
      ],
    });
  } catch (err) {
    console.error("Error in getDashboardStats:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { getArrearsAgeing, getDefaultersList, getDashboardStats };
