const testDb = require("../helpers/testDb");
const fixtures = require("../helpers/fixtures");
const { getUnitMeta, getBlock } = require("../../src/utils/damrSchemas");
const {
  createUnit,
  getUnits,
  getUnit,
  updateUnit,
} = require("../../src/controllers/facility/units");

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

function adminReq(body = {}, params = {}, query = {}) {
  return { body, params, query, user: { role: "admin" } };
}
describe("units controller — blockId/floor persistence (Roadmap Phase 8, #20)", () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterEach(async () => {
    await testDb.clearDatabase();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  test("createUnit persists blockId and floor via the UnitMeta join, not the raw Unit doc", async () => {
    const facility = await fixtures.createFacility();
    const Block = getBlock();
    const block = await Block.create({
      name: "Tower A",
      facilityId: facility._id,
    });

    const res = mockRes();
    await createUnit(
      adminReq({
        name: "A101",
        facilityId: String(facility._id),
        blockId: String(block._id),
        floor: 3,
        unitType: "Residential",
        division: "A",
        floorUnitNo: "1",
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.send.mock.calls[0][0];
    expect(String(body.unit.blockId)).toBe(String(block._id));
    expect(body.unit.floor).toBe("3");

    const UnitMeta = getUnitMeta();
    const meta = await UnitMeta.findOne({ unitId: body.unit._id }).lean();
    expect(meta).not.toBeNull();
    expect(String(meta.blockId)).toBe(String(block._id));
    expect(meta.floor).toBe("3");
  });

  test('createUnit with floor: 0 (ground floor) persists as "0", not null', async () => {
    const facility = await fixtures.createFacility();
    const res = mockRes();
    await createUnit(
      adminReq({
        name: "G01",
        facilityId: String(facility._id),
        floor: 0,
        unitType: "Residential",
        division: "A",
        floorUnitNo: "GF",
      }),
      res,
    );

    const body = res.send.mock.calls[0][0];
    expect(body.unit.floor).toBe("0");
  });

  test("getUnits with ?blockId= actually filters by block (previously always empty)", async () => {
    const facility = await fixtures.createFacility();
    const Block = getBlock();
    const blockA = await Block.create({
      name: "Tower A",
      facilityId: facility._id,
    });
    const blockB = await Block.create({
      name: "Tower B",
      facilityId: facility._id,
    });

    const unitInA = await fixtures.createUnit(facility, { name: "A1" });
    const unitInB = await fixtures.createUnit(facility, { name: "B1" });
    const UnitMeta = getUnitMeta();
    await UnitMeta.create({ unitId: unitInA._id, blockId: blockA._id });
    await UnitMeta.create({ unitId: unitInB._id, blockId: blockB._id });

    const res = mockRes();
    await getUnits(adminReq({}, {}, { blockId: String(blockA._id) }), res);

    const body = res.send.mock.calls[0][0];
    expect(body.units).toHaveLength(1);
    expect(body.units[0].name).toBe("A1");
    expect(String(body.units[0].blockId)).toBe(String(blockA._id));
  });

  test("getUnit returns the linked blockId and floor", async () => {
    const facility = await fixtures.createFacility();
    const Block = getBlock();
    const block = await Block.create({
      name: "Tower A",
      facilityId: facility._id,
    });
    const unit = await fixtures.createUnit(facility);
    const UnitMeta = getUnitMeta();
    await UnitMeta.create({ unitId: unit._id, blockId: block._id, floor: 5 });

    const res = mockRes();
    await getUnit(adminReq({}, { id: String(unit._id) }), res);

    const body = res.send.mock.calls[0][0];
    expect(String(body.unit.blockId)).toBe(String(block._id));
    expect(body.unit.floor).toBe("5");
  });

  test("updateUnit can change the block link and floor independently without wiping the other", async () => {
    const facility = await fixtures.createFacility();
    const Block = getBlock();
    const blockA = await Block.create({
      name: "Tower A",
      facilityId: facility._id,
    });
    const blockB = await Block.create({
      name: "Tower B",
      facilityId: facility._id,
    });
    const unit = await fixtures.createUnit(facility);
    const UnitMeta = getUnitMeta();
    await UnitMeta.create({ unitId: unit._id, blockId: blockA._id, floor: 2 });

    let res = mockRes();
    await updateUnit(
      adminReq({ blockId: String(blockB._id) }, { id: String(unit._id) }),
      res,
    );
    let body = res.send.mock.calls[0][0];
    expect(String(body.unit.blockId)).toBe(String(blockB._id));
    expect(body.unit.floor).toBe("2");

    // Update floor only — block link should be preserved.
    res = mockRes();
    await updateUnit(adminReq({ floor: 7 }, { id: String(unit._id) }), res);
    body = res.send.mock.calls[0][0];
    expect(String(body.unit.blockId)).toBe(String(blockB._id));
    expect(body.unit.floor).toBe("7");

    // Clear the block entirely, leaving floor set — meta row should survive.
    res = mockRes();
    await updateUnit(
      adminReq({ blockId: null }, { id: String(unit._id) }),
      res,
    );
    body = res.send.mock.calls[0][0];
    expect(body.unit.blockId).toBeNull();
    expect(body.unit.floor).toBe("7");

    // Clear floor too — now nothing is set, so the meta row is removed.
    res = mockRes();
    await updateUnit(adminReq({ floor: null }, { id: String(unit._id) }), res);
    body = res.send.mock.calls[0][0];
    expect(body.unit.blockId).toBeNull();
    expect(body.unit.floor).toBeNull();

    const remaining = await UnitMeta.findOne({ unitId: unit._id }).lean();
    expect(remaining).toBeNull();
  });
});
