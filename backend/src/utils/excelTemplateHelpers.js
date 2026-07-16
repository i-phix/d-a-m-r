const GRAY_FILL = "FFD9D9D9";
const WHITE_FILL = "FFFFFFFF";
const GREEN_BORDER = "FF28A745";
const NEXT_BUTTON_FILL = "FFFD7E14";
const NEXT_BUTTON_BORDER = "FFB35900";

function colLetter(n) {
  let s = "";
  let num = n;
  do {
    s = String.fromCharCode(65 + (num % 26)) + s;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);
  return s;
}

function fillRange(sheet, startRow, endRow, startCol, endCol, argbColor) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      sheet.getCell(r, c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: argbColor },
      };
    }
  }
}
function applyGridBorders(
  sheet,
  startRow,
  endRow,
  startCol,
  endCol,
  argbColor,
) {
  const style = { style: "thin", color: { argb: argbColor } };
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      sheet.getCell(r, c).border = {
        top: style,
        bottom: style,
        left: style,
        right: style,
      };
    }
  }
}

function applyOuterBorder(
  sheet,
  startRow,
  endRow,
  startCol,
  endCol,
  argbColor,
) {
  const style = { style: "medium", color: { argb: argbColor } };
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = sheet.getCell(r, c);
      const border = { ...(cell.border || {}) };
      if (r === startRow) border.top = style;
      if (r === endRow) border.bottom = style;
      if (c === startCol) border.left = style;
      if (c === endCol) border.right = style;
      cell.border = border;
    }
  }
}
function buildPropertySheet(
  workbook,
  facilities,
  nextSheetTarget,
  buttonLabel = "Next  →",
  helperSheetName = "UnitLists",
) {
  const propertySheet = workbook.addWorksheet("Property", {
    views: [{ showGridLines: false }],
  });
  propertySheet.getColumn(1).width = 40;
  fillRange(propertySheet, 1, 30, 1, 8, GRAY_FILL);

  const facilityLabelCell = propertySheet.getCell("A1");
  facilityLabelCell.value = "Facility";
  facilityLabelCell.font = {
    bold: true,
    size: 12,
    color: { argb: "FF333333" },
  };
  facilityLabelCell.alignment = { horizontal: "left", vertical: "middle" };
  facilityLabelCell.protection = { locked: true };

  const propertyCell = propertySheet.getCell("A2");
  propertyCell.dataValidation = {
    type: "list",
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: "Invalid property",
    error: "Please choose one of the listed properties.",
    showInputMessage: true,
    promptTitle: "Select Property",
    prompt: "Choose the property this import is for, then click Next below.",
    formulae: [`${helperSheetName}!$A$1:$A$${facilities.length}`],
  };
  propertyCell.protection = { locked: false };
  propertyCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: WHITE_FILL },
  };
  applyOuterBorder(propertySheet, 2, 2, 1, 1, GREEN_BORDER);
  propertySheet.properties.tabColor = { argb: "FFFD7E14" };

  propertySheet.mergeCells("A4:C5");
  const nextButtonCell = propertySheet.getCell("A4");
  nextButtonCell.value = {
    text: buttonLabel,
    hyperlink: `#${nextSheetTarget}`,
    tooltip: `Go to the ${nextSheetTarget.split("!")[0]} sheet`,
  };
  nextButtonCell.font = {
    bold: true,
    size: 12,
    color: { argb: "FFFFFFFF" },
    underline: false,
  };
  nextButtonCell.alignment = { horizontal: "center", vertical: "middle" };
  for (let r = 4; r <= 5; r++) {
    for (let c = 1; c <= 3; c++) {
      const cell = propertySheet.getCell(r, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: NEXT_BUTTON_FILL },
      };
      cell.protection = { locked: true };
    }
  }
  applyOuterBorder(propertySheet, 4, 5, 1, 3, NEXT_BUTTON_BORDER);
  propertySheet.getRow(4).height = 20;
  propertySheet.getRow(5).height = 20;

  return { propertySheet, propertyCell };
}

module.exports = {
  GRAY_FILL,
  WHITE_FILL,
  GREEN_BORDER,
  NEXT_BUTTON_FILL,
  NEXT_BUTTON_BORDER,
  colLetter,
  fillRange,
  applyGridBorders,
  applyOuterBorder,
  buildPropertySheet,
};
