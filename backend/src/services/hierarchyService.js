const { getBlock, getFloor } = require("../utils/damrSchemas");
const { buildFallbackNames } = require("./aiMessageService");

// Facility -> Block/Court/Tower/Wing (one or more differently-typed groups
// per facility) -> Floor (optional per group) -> Unit. A facility like
// "Bosquet" can have 3 Blocks (A/B/C), a Court (Northwing), and a Tower —
// each a separate group with its own type, its own count, and its own
// floor count, created together or incrementally.

// Resolves how many floors a group of blocks/courts/towers should each
// get. Never silently defaults to 1: the count must be given directly
// (`numFloors`, which must be at least 1 — every group has at least one
// floor). No more free-text extraction — explicit fields only.
function resolveNumFloors({ numFloors, groupLabel }) {
  const n = Number(numFloors);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `Number of floors for "${groupLabel}" is required and must be a whole number >= 1`,
    );
  }
  return n;
}

// Creates one same-typed group (e.g. "3 Blocks: A to C", or "1 Court:
// Northwing") — deterministically names the block(s) (type + letter, or an
// explicit single name), then immediately creates each one's Floor records
// too (deterministically named, honoring an optional basement count) in
// the same step, so floors don't need a separate later action.
async function createBlockGroup({
  facilityId,
  type,
  count,
  numFloors,
  numBasements,
  singleName, // optional explicit name, only honored when count === 1
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

  // Guard against accidental duplicates — e.g. clicking "Add" twice, or
  // re-running the same type for a facility that already has it. Name
  // clash is checked per facility (case-insensitive), regardless of type,
  // since two divisions sharing a display name would be indistinguishable
  // everywhere else in the UI (unit dropdowns, tables).
  const existing = await Block.find({
    facilityId,
    name: { $in: names.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) },
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

    results.push({ ...block.toObject(), type: resolvedType, floors: floorDocs });
  }

  return results;
}

// Runs createBlockGroup for each group in a batch — used at facility
// creation time when several differently-typed groups (Blocks, a Court, a
// Tower...) are all set up in one go.
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
