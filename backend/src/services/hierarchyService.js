const { getBlock, getFloor } = require("../utils/damrSchemas");
const { buildFallbackNames } = require("./aiMessageService");

function resolveNumFloors({ numFloors, groupLabel }) {
  const n = Number(numFloors);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `Number of floors for "${groupLabel}" is required and must be a whole number >= 1`,
    );
  }
  return n;
}
async function createBlockGroup({
  facilityId,
  type,
  count,
  numFloors,
  numBasements,
  singleName,
  userId,
}) {
  const n = Number(count) || 0;
  if (n <= 0) {
    throw new Error(`Count for "${type || "Block"}" must be at least 1`);
  }
  const resolvedType = (type || "Block").trim();
  const resolvedFloors = resolveNumFloors({
    numFloors,
    groupLabel: resolvedType,
  });
  const resolvedBasements = Number.isInteger(Number(numBasements))
    ? Number(numBasements)
    : 0;

  const names =
    n === 1 && singleName && singleName.trim()
      ? [singleName.trim()]
      : buildFallbackNames("block", n, resolvedType);

  const Block = getBlock();
  const Floor = getFloor();

  const existing = await Block.find({
    facilityId,
    name: {
      $in: names.map(
        (n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      ),
    },
  }).lean();
  if (existing.length) {
    throw new Error(
      `"${existing.map((b) => b.name).join(", ")}" already exists in this facility — choose a different name.`,
    );
  }

  const results = [];

  for (const name of names) {
    const block = await Block.create({
      name,
      facilityId,
      type: resolvedType,
      createdBy: userId,
    });

    let floorDocs = [];
    if (resolvedFloors > 0) {
      const floorNames = buildFallbackNames(
        "floor",
        resolvedFloors,
        null,
        resolvedBasements,
      );
      floorDocs = await Floor.insertMany(
        floorNames.map((floorName, i) => ({
          name: floorName,
          blockId: block._id,
          facilityId,
          order: i,
          createdBy: userId,
        })),
      );
    }

    results.push({
      ...block.toObject(),
      type: resolvedType,
      floors: floorDocs,
    });
  }

  return results;
}
async function createBlockGroups({ facilityId, groups, userId }) {
  const all = [];
  for (const group of groups || []) {
    const created = await createBlockGroup({
      facilityId,
      type: group.type,
      count: group.count,
      numFloors: group.numFloors,
      numBasements: group.numBasements,
      singleName: group.name,
      userId,
    });
    all.push(...created);
  }
  return all;
}

module.exports = { createBlockGroup, createBlockGroups, resolveNumFloors };
