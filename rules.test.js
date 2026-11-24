const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
require("./dist/rules.js");
require("./dist/demo.js");
const b = globalThis.Bakery;
const monday = "2026-11-23";
const tuesday = "2026-11-24";
const wednesday = "2026-11-25";
const friday = "2026-11-27";
const request = (id, date, quantity) => ({ id, date, quantity, sent: monday, type: "new", product: "cake", customer: id });
const find = (state, id) => state.orders.find(order => order.id === id);
const file = fs.readFileSync(require("node:path").join(__dirname, "dist/InstagramOrders_Monday.html"), "utf8");
const sample = JSON.parse(file.match(/type="application\/json">([\s\S]*?)<\/script>/)[1]);

test("opening bookings and financial totals match product rules", () => {
  const state = createBakery();
  assert.equal(b.summary(state, friday).booked, 300);
  assert.equal(b.summary(state, friday).capacity - b.summary(state, friday).booked, 180);
  const sales = Array.from({ length: 7 }, (_, i) => b.summary(state, b.addDays(monday, i)).revenue);
  assert.equal(sales.reduce((a, c) => a + c), 1880);
});

test("sample import applies changes and cancellations once", () => {
  const state = createBakery();
  b.fetchMessages(state, b.validateMessages(sample));
  b.fetchMessages(state, b.validateMessages(sample));
  assert.equal(state.inbox.length, 5);
  assert.equal(find(state, "okafor").status, "Incompatible");
  assert.equal(find(state, "jasmine").status, "Requested");
  assert.equal(find(state, "brown").quantity, 3);
  assert.equal(find(state, "moreau").status, "Cancelled");
});

test("bulk acceptance observes capacity and closes the current pickup day", () => {
  const state = createBakery();
  b.fetchMessages(state, [request("first", wednesday, 3), request("second", wednesday, 1)]);
  b.acceptAndAdvance(state);
  assert.equal(state.today, tuesday);
  assert.equal(find(state, "kim").status, "Picked up");
  assert.equal(find(state, "first").status, "Accepted");
  assert.equal(find(state, "second").status, "Incompatible");
  assert.equal(b.summary(state, wednesday).booked, 480);
  assert.equal(b.summary(state, monday).revenue, 280);
});

test("helper adds exactly four hours and can unblock an order", () => {
  const state = createBakery();
  b.fetchMessages(state, [request("large", wednesday, 5)]);
  assert.equal(find(state, "large").status, "Incompatible");
  assert.equal(b.bookHelper(state, tuesday), false);
  assert.equal(b.bookHelper(state, wednesday), true);
  assert.equal(b.bookHelper(state, wednesday), false);
  assert.equal(b.acceptOrder(state, "large"), true);
  assert.equal(b.summary(state, wednesday).booked, 720);
  assert.equal(b.summary(state, wednesday).cost, 100);
});

test("short notice, overcapacity changes, and rejection preserve valid bookings", () => {
  const state = createBakery();
  b.fetchMessages(state, [
    { id: "cancel", type: "cancel", orderId: "ali", sent: monday },
    { ...request("move", friday, 3), type: "change", orderId: "fox" },
    request("decline", wednesday, 1)
  ]);
  b.rejectOrder(state, "decline");
  b.acceptAndAdvance(state);
  assert.equal(find(state, "ali").status, "Accepted");
  assert.equal(find(state, "fox").date, wednesday);
  assert.equal(find(state, "decline").status, "Rejected");
});

test("invalid import data is rejected before it reaches the order store", () => {
  assert.throws(() => b.validateMessages([request("bad", "2026-11-31", 1)]));
  assert.throws(() => b.validateMessages([request("bad", friday, 0)]));
  assert.throws(() => b.validateMessages([sample[0], sample[0]]));
});
