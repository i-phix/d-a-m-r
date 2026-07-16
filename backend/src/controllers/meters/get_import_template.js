const ExcelJS = require("exceljs");
const db = require("../../utils/coreSchemas");
const { getMeter: getMeterModel } = require("../../utils/damrSchemas");
const {
  GRAY_FILL,
  WHITE_FILL,
  GREEN_BORDER,
  colLetter,
  fillRange,
  applyGridBorders,
  applyOuterBorder,
  buildPropertySheet,
} = require("../../utils/excelTemplateHelpers");

const MAX_TEMPLATE_ROWS = 500; // pre-provisioned, ready-to-fill data rows

const HEADERS = [
  { key: "serialNumber", label: "serialNumber", width: 20 },
  { key: "manufacturer", label: "manufacturer", width: 16 },
  { key: "model", label: "model", width: 14 },
  { key: "meterType", label: "meterType", width: 12 },
  { key: "installationDate", label: "installationDate", width: 16 },
  { key: "initialReading", label: "initialReading", width: 14 },
  { key: "condition", label: "condition", width: 12 },
  {
    key: "unitName",
    label: "unitName (optional — auto-assigns the meter)",
    width: 34,
  },
];
const getImportTemplate = async (req, res) => {
  try {
    const facilityFilter = {};
    if (req.user.role === "editor") {
      facilityFilter._id = req.user.facilityId;
    }
    const facilities = await db.Facility.find(facilityFilter)
      .sort({ name: 1 })
      .select("name")
      .lean();

    if (facilities.length === 0) {
      return res.status(400).send({
        error:
          "No registered properties found — register a property before downloading this template",
      });
    }

    const allUnits = await db.Unit.find({
      facilityId: { $in: facilities.map((f) => f._id) },
    })
      .select("name facilityId")
      .sort({ name: 1 })
      .lean();
    const Meter = getMeterModel();
    const unitsWithMeters = await Meter.find({
      unitId: { $in: allUnits.map((u) => u._id) },
    })
      .select("unitId")
      .lean();
    const unitIdsWithMeters = new Set(
      unitsWithMeters.map((m) => String(m.unitId)),
    );

    const unitsByFacility = new Map();
    for (const unit of allUnits) {
      if (unitIdsWithMeters.has(String(unit._id))) continue; // already metered
      const key = String(unit.facilityId);
      if (!unitsByFacility.has(key)) unitsByFacility.set(key, []);
      unitsByFacility.get(key).push(unit.name);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DAMR";
    workbook.created = new Date();
    const helperSheet = workbook.addWorksheet("UnitLists", {
      state: "veryHidden",
    });
    facilities.forEach((facility, i) => {
      const units = unitsByFacility.get(String(facility._id)) || [];
      const listValues = units.length > 0 ? units : ["(no unassigned units)"];
      const col = colLetter(i + 3); // columns D, E, F... (0=A,1=B,2=C reserved below)
      listValues.forEach((val, r) => {
        helperSheet.getCell(`${col}${r + 1}`).value = val;
      });
      helperSheet.getCell(`A${i + 1}`).value = facility.name;
      helperSheet.getCell(`B${i + 1}`).value =
        `UnitLists!$${col}$1:$${col}$${listValues.length}`;
    });

    buildPropertySheet(
      workbook,
      facilities,
      "Meters!A2",
      "Next: Fill Meters  →",
    );

    const metersSheet = workbook.addWorksheet("Meters", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });
    HEADERS.forEach((h, i) => {
      const col = i + 1;
      metersSheet.getColumn(col).width = h.width;
      const cell = metersSheet.getCell(1, col);
      cell.value = h.label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0D3B66" },
      };
      cell.protection = { locked: true };
    });
    for (let col = HEADERS.length + 1; col <= HEADERS.length + 50; col++) {
      metersSheet.getColumn(col).hidden = true;
    }

    const meterTypeCol = HEADERS.findIndex((h) => h.key === "meterType") + 1;
    const conditionCol = HEADERS.findIndex((h) => h.key === "condition") + 1;
    const unitNameCol = HEADERS.findIndex((h) => h.key === "unitName") + 1;
    const installationDateCol =
      HEADERS.findIndex((h) => h.key === "installationDate") + 1;
    const lastRow = MAX_TEMPLATE_ROWS + 1;
    metersSheet.getColumn(installationDateCol).numFmt = "yyyy-mm-dd";
    metersSheet.dataValidations.add(
      `${colLetter(meterTypeCol - 1)}2:${colLetter(meterTypeCol - 1)}${lastRow}`,
      {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        formulae: ['"analogue,digital"'],
      },
    );
    metersSheet.dataValidations.add(
      `${colLetter(conditionCol - 1)}2:${colLetter(conditionCol - 1)}${lastRow}`,
      {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        formulae: ['"new,used,replaced"'],
      },
    );
    metersSheet.dataValidations.add(
      `${colLetter(unitNameCol - 1)}2:${colLetter(unitNameCol - 1)}${lastRow}`,
      {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        showInputMessage: true,
        promptTitle: "Optional",
        prompt: "Pick a unit to auto-assign this meter, or leave blank.",
        formulae: [
          `INDIRECT(VLOOKUP(Property!$A$2,UnitLists!$A$1:$B$${facilities.length},2,FALSE))`,
        ],
      },
    );

    const today = new Date();
    for (let r = 2; r <= lastRow; r++) {
      for (let c = 1; c <= HEADERS.length; c++) {
        const cell = metersSheet.getCell(r, c);
        cell.protection = { locked: false };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: WHITE_FILL },
        };
      }
      metersSheet.getCell(r, installationDateCol).value = today;
    }
    fillRange(
      metersSheet,
      lastRow + 1,
      lastRow + 50,
      1,
      HEADERS.length,
      GRAY_FILL,
    );
    applyGridBorders(metersSheet, 1, lastRow, 1, HEADERS.length, "FFBFBFBF");
    applyOuterBorder(metersSheet, 1, lastRow, 1, HEADERS.length, GREEN_BORDER);

    const propertySheet = workbook.getWorksheet("Property");
    await propertySheet.protect("", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
    });
    await metersSheet.protect("", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertRows: false,
      deleteRows: false,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="meter_import_template.xlsx"',
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error in getImportTemplate:", err);
    if (!res.headersSent) {
      res.status(400).send({ error: err.message });
    }
  }
};

module.exports = getImportTemplate;
