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

const MAX_TEMPLATE_ROWS = 500;

const HEADERS = [
  { key: "meterSerial", label: "meterSerial", width: 20 },
  { key: "unit", label: "unit (auto-filled)", width: 20 },
  { key: "value", label: "value", width: 14 },
  { key: "readingDate", label: "readingDate", width: 16 },
  { key: "notes", label: "notes (optional)", width: 30 },
];
const getReadingImportTemplate = async (req, res) => {
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
    const Meter = getMeterModel();
    const assignedMeters = await Meter.find({
      facilityId: { $in: facilities.map((f) => f._id) },
      status: "ASSIGNED",
    })
      .populate("unitId", "name")
      .select("serialNumber unitId facilityId")
      .sort({ serialNumber: 1 })
      .lean();

    const metersByFacility = new Map();
    for (const meter of assignedMeters) {
      const key = String(meter.facilityId);
      if (!metersByFacility.has(key)) metersByFacility.set(key, []);
      metersByFacility.get(key).push(meter);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "DAMR";
    workbook.created = new Date();
    const helperSheet = workbook.addWorksheet("MeterLists", {
      state: "veryHidden",
    });
    facilities.forEach((facility, i) => {
      const meters = metersByFacility.get(String(facility._id)) || [];
      const listValues =
        meters.length > 0
          ? meters.map((m) => m.serialNumber)
          : ["(no assigned meters)"];
      const col = colLetter(i + 3); // columns D, E, F...
      listValues.forEach((val, r) => {
        helperSheet.getCell(`${col}${r + 1}`).value = val;
      });
      helperSheet.getCell(`A${i + 1}`).value = facility.name;
      helperSheet.getCell(`B${i + 1}`).value =
        `MeterLists!$${col}$1:$${col}$${listValues.length}`;
    });
    assignedMeters.forEach((meter, i) => {
      helperSheet.getCell(`H${i + 1}`).value = meter.serialNumber;
      helperSheet.getCell(`I${i + 1}`).value = meter.unitId?.name || "";
    });
    const lookupTableLastRow = Math.max(assignedMeters.length, 1);

    buildPropertySheet(
      workbook,
      facilities,
      "Readings!A2",
      "Next: Fill Readings  →",
      "MeterLists",
    );

    const readingsSheet = workbook.addWorksheet("Readings", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });
    HEADERS.forEach((h, i) => {
      const col = i + 1;
      readingsSheet.getColumn(col).width = h.width;
      const cell = readingsSheet.getCell(1, col);
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
      readingsSheet.getColumn(col).hidden = true;
    }

    const meterSerialCol =
      HEADERS.findIndex((h) => h.key === "meterSerial") + 1;
    const unitCol = HEADERS.findIndex((h) => h.key === "unit") + 1;
    const readingDateCol =
      HEADERS.findIndex((h) => h.key === "readingDate") + 1;
    const lastRow = MAX_TEMPLATE_ROWS + 1;
    readingsSheet.getColumn(readingDateCol).numFmt = "yyyy-mm-dd";

    readingsSheet.dataValidations.add(
      `${colLetter(meterSerialCol - 1)}2:${colLetter(meterSerialCol - 1)}${lastRow}`,
      {
        type: "list",
        allowBlank: false,
        showErrorMessage: true,
        showInputMessage: true,
        promptTitle: "Select Meter",
        prompt:
          "Pick a meter belonging to the property chosen on the Property sheet.",
        formulae: [
          `INDIRECT(VLOOKUP(Property!$A$2,MeterLists!$A$1:$B$${facilities.length},2,FALSE))`,
        ],
      },
    );

    const today = new Date();
    for (let r = 2; r <= lastRow; r++) {
      for (let c = 1; c <= HEADERS.length; c++) {
        const cell = readingsSheet.getCell(r, c);
        cell.protection = { locked: false };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: WHITE_FILL },
        };
      }

      readingsSheet.getCell(r, readingDateCol).value = today;
      const unitCell = readingsSheet.getCell(r, unitCol);
      unitCell.value = {
        formula: `IFERROR(VLOOKUP($${colLetter(meterSerialCol - 1)}${r},MeterLists!$H$1:$I$${lookupTableLastRow},2,FALSE),"")`,
      };
      unitCell.protection = { locked: true };
      unitCell.font = { italic: true, color: { argb: "FF666666" } };
      unitCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: GRAY_FILL },
      };
    }

    fillRange(
      readingsSheet,
      lastRow + 1,
      lastRow + 50,
      1,
      HEADERS.length,
      GRAY_FILL,
    );
    applyGridBorders(readingsSheet, 1, lastRow, 1, HEADERS.length, "FFBFBFBF");
    applyOuterBorder(
      readingsSheet,
      1,
      lastRow,
      1,
      HEADERS.length,
      GREEN_BORDER,
    );

    const propertySheet = workbook.getWorksheet("Property");
    await propertySheet.protect("", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
    });
    await readingsSheet.protect("", {
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
      'attachment; filename="reading_import_template.xlsx"',
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Error in getReadingImportTemplate:", err);
    if (!res.headersSent) {
      res.status(400).send({ error: err.message });
    }
  }
};

module.exports = getReadingImportTemplate;
