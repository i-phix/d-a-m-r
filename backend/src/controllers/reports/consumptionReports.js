const db = require("../../utils/coreSchemas");
const { getReading: getReadingModel } = require("../../utils/damrSchemas");
function monthKey(y, m) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
const getConsumptionTrends = async (req, res) => {
  try {
    const Reading = getReadingModel();
    const monthsBack = Math.min(
      Math.max(parseInt(req.query.months, 10) || 6, 2),
      12,
    );

    const filter = {};
    if (req.user.role === "editor") {
      filter.facilityId = req.user.facilityId;
    } else if (req.query.facilityId) {
      filter.facilityId = req.query.facilityId;
    }

    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - (monthsBack - 1));
    windowStart.setDate(1);
    windowStart.setHours(0, 0, 0, 0);

    const rows = await Reading.aggregate([
      {
        $match: {
          ...filter,
          readingDate: { $gte: windowStart },
          consumption: { $ne: null, $gte: 0 },
        },
      },
      {
        $group: {
          _id: {
            unitId: "$unitId",
            y: { $year: "$readingDate" },
            m: { $month: "$readingDate" },
          },
          consumption: { $sum: "$consumption" },
        },
      },
    ]);
    const months = Array.from({ length: monthsBack }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (monthsBack - 1 - i));
      return {
        key: monthKey(d.getFullYear(), d.getMonth() + 1),
        name: d.toLocaleString("default", { month: "short" }),
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      };
    });
    const facilityTotals = new Map(months.map((m) => [m.key, 0]));
    const unitTotals = new Map(); // unitId -> Map(monthKey -> consumption)

    for (const row of rows) {
      const key = monthKey(row._id.y, row._id.m);
      if (!facilityTotals.has(key)) continue; // outside window edge case
      facilityTotals.set(key, facilityTotals.get(key) + row.consumption);

      const unitKey = row._id.unitId ? String(row._id.unitId) : "unassigned";
      if (!unitTotals.has(unitKey)) unitTotals.set(unitKey, new Map());
      const unitMap = unitTotals.get(unitKey);
      unitMap.set(key, (unitMap.get(key) || 0) + row.consumption);
    }

    const facilityMonthly = months.map((m, i) => {
      const consumption = facilityTotals.get(m.key) || 0;
      const prev = i > 0 ? facilityTotals.get(months[i - 1].key) || 0 : null;
      const deltaPct = prev
        ? Number((((consumption - prev) / prev) * 100).toFixed(1))
        : null;
      return { name: m.name, consumption, deltaPct };
    });

    // Resolve unit names for the units that actually appear.
    const unitIds = Array.from(unitTotals.keys()).filter(
      (k) => k !== "unassigned",
    );
    const units = unitIds.length
      ? await db.Unit.find({ _id: { $in: unitIds } })
          .select("name")
          .lean()
      : [];
    const unitNameById = new Map(units.map((u) => [String(u._id), u.name]));

    const byUnit = Array.from(unitTotals.entries()).map(
      ([unitId, monthMap]) => {
        const monthly = months.map((m) => ({
          name: m.name,
          consumption: monthMap.get(m.key) || 0,
        }));
        const latest = monthly[monthly.length - 1]?.consumption || 0;
        const previous = monthly[monthly.length - 2]?.consumption || 0;
        const deltaPct = previous
          ? Number((((latest - previous) / previous) * 100).toFixed(1))
          : null;
        return {
          unitId: unitId === "unassigned" ? null : unitId,
          unitName:
            unitId === "unassigned"
              ? "Unassigned"
              : unitNameById.get(unitId) || "Unknown unit",
          monthly,
          latestConsumption: latest,
          deltaPct,
        };
      },
    );

    // Surface the biggest movers (up or down) first.
    byUnit.sort(
      (a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0),
    );

    return res.status(200).send({
      message: "Consumption trends fetched successfully",
      facilityMonthly,
      byUnit,
    });
  } catch (err) {
    console.error("Error in getConsumptionTrends:", err);
    return res.status(400).send({ error: err.message });
  }
};

module.exports = { getConsumptionTrends };
