"use strict";

const storageKey = "bakery-order-desk-v1";
const $ = id => document.getElementById(id);
const dateText = (date, long = false) => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
  weekday: long ? "long" : "short", month: long ? "long" : "short", day: "numeric", timeZone: "UTC"
});
const hours = minutes => Number.isInteger(minutes / 60)
  ? minutes / 60 + " h" : Math.floor(minutes / 60) + " h " + (minutes % 60) + " min";
const money = value => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0
}).format(value);
const description = order => order.quantity + " " + Bakery.products[order.product].unit
  + (order.product === "cake" && order.quantity > 1 ? "s" : "");

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}
function button(label, action, accessibleLabel) {
  const node = element("button", label);
  node.onclick = action;
  if (accessibleLabel) node.setAttribute("aria-label", accessibleLabel);
  return node;
}
function row(title, details, controls, tone = "muted") {
  const wrapper = element("div", null, "row");
  const copy = element("div");
  copy.append(element("p", title, "stat"), element("p", details, tone));
  wrapper.append(copy);
  if (controls?.length) {
    const group = element("div", null, "actions");
    group.append(...controls);
    wrapper.append(group);
  }
  return wrapper;
}

let state;
try {
  state = JSON.parse(localStorage.getItem(storageKey)) || createBakery();
} catch {
  state = createBakery();
  $("feedback").textContent = "Saved orders could not be opened. The demo was loaded.";
}
function update(action) {
  try {
    const draft = structuredClone(state);
    const message = action(draft);
    localStorage.setItem(storageKey, JSON.stringify(draft));
    state = draft;
    render();
    $("feedback").textContent = message;
  } catch (error) {
    $("feedback").textContent = error.message;
  }
}

function renderRequests() {
  const container = $("requests");
  container.replaceChildren();
  for (const order of state.orders.filter(item => ["Requested", "Incompatible"].includes(item.status))) {
    const reason = order.date < state.today ? "Pickup day has passed." : Bakery.issue(state, order, order.sent);
    const detail = reason || hours(Bakery.summary(state, order.date).booked) + " already booked";
    const name = order.customer + " · " + description(order);
    const accept = button("Accept", () => update(draft => Bakery.acceptOrder(draft, order.id)
      ? order.customer + " accepted." : "This request is incompatible."), "Accept " + order.customer);
    const reject = button("Reject", () => update(draft => {
      Bakery.rejectOrder(draft, order.id);
      return order.customer + " rejected.";
    }), "Reject " + order.customer);
    accept.disabled = Boolean(reason);
    container.append(row(name, dateText(order.date) + " · " + detail, [accept, reject], reason ? "bad" : "muted"));
  }
  if (!container.children.length) container.append(element("p", "No requests awaiting a decision.", "muted"));
}

function render() {
  $("today").textContent = dateText(state.today, true);
  const today = Bakery.summary(state, state.today);
  const pickup = $("pickup");
  pickup.replaceChildren(element("p", hours(today.booked) + " booked · Pickup at 5 PM", "muted"));
  for (const order of today.orders) pickup.append(row(order.customer, description(order)));
  if (!today.orders.length) pickup.append(element("p", "No pickups scheduled.", "muted"));
  renderRequests();

  $("calendar").replaceChildren();
  for (let offset = 1; offset <= 5; offset++) {
    const date = Bakery.addDays(state.today, offset);
    const { booked, capacity, cost, orders } = Bakery.summary(state, date);
    const card = element("article", null, "day");
    const meter = element("progress");
    meter.max = capacity;
    meter.value = booked;
    meter.setAttribute("aria-label", "Booked oven time on " + dateText(date));
    card.append(element("h3", dateText(date)), meter,
      element("p", hours(booked) + " booked · " + hours(capacity - booked) + " left", "muted"));
    for (const order of orders) card.append(element("p", order.customer + " · " + description(order), "order"));
    const helper = button(cost ? "Helper booked" : "+4 h · $100", () => update(draft => {
      if (!Bakery.bookHelper(draft, date)) return "A helper can’t be booked for this date.";
      return "Helper booked for " + dateText(date) + ".";
    }), "Book helper for " + dateText(date));
    helper.disabled = Boolean(cost) || !Bakery.hasNotice(date, state.today);
    if (!cost && helper.disabled) helper.textContent = "Helper needs 2 days’ notice";
    if (cost) helper.setAttribute("aria-label", "Helper booked for " + dateText(date));
    card.append(helper);
    $("calendar").append(card);
  }

  const changes = state.inbox.filter(message => message.type !== "new");
  $("changes").replaceChildren(...changes.map(message => {
    const order = state.orders.find(item => item.id === message.orderId);
    const action = message.type === "cancel" ? "Cancellation" : "Change";
    return row((order?.customer || message.orderId) + " · " + action, dateText(message.sent) + " · " + message.result);
  }));
  if (!changes.length) $("changes").append(element("p", "No changes or cancellations received.", "muted"));

  const weekday = new Date(state.today + "T12:00:00Z").getUTCDay();
  const monday = Bakery.addDays(state.today, -((weekday + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => Bakery.summary(state, Bakery.addDays(monday, i)));
  const sales = week.reduce((sum, day) => sum + day.revenue, 0);
  const costs = week.reduce((sum, day) => sum + day.cost, 0);
  $("money").replaceChildren(element("p", dateText(monday) + " to " + dateText(Bakery.addDays(monday, 6)), "muted"),
    row("Sales", money(sales)), row("Helper costs", money(costs)), row("Sales less helper costs", money(sales - costs)));

  $("history").replaceChildren(...state.orders.filter(order => ["Picked up", "Rejected", "Cancelled"].includes(order.status))
    .map(order => row(order.customer + " · " + description(order), dateText(order.date) + " · " + order.status)));
  if (!$("history").children.length) $("history").append(element("p", "No closed orders yet.", "muted"));
}

function importMessages(source, html) {
  const data = html ? new DOMParser().parseFromString(source, "text/html").getElementById("instagram-messages") : null;
  if (html && !data) throw new Error("The HTML file needs an instagram-messages JSON block. See the project guide.");
  const messages = Bakery.validateMessages(JSON.parse(html ? data.textContent : source));
  update(draft => {
    const before = draft.inbox.length;
    Bakery.fetchMessages(draft, messages);
    const count = draft.inbox.length - before;
    return count ? count + (count === 1 ? " new DM processed." : " new DMs processed.") : "No new DMs through " + dateText(draft.today) + ".";
  });
}

$("fetch").onclick = async () => {
  if (location.protocol === "file:") {
    $("feedback").textContent = "Select InstagramOrders_Monday.html from the app folder.";
    $("file").click();
    return;
  }
  try {
    const response = await fetch("./InstagramOrders_Monday.html");
    if (!response.ok) throw new Error("The demo DM file could not be fetched.");
    importMessages(await response.text(), true);
  } catch (error) {
    $("feedback").textContent = error.message;
  }
};
$("import").onclick = () => $("file").click();
$("file").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = "";
  try {
    importMessages(await file.text(), /\.html?$/i.test(file.name));
  } catch (error) {
    $("feedback").textContent = error.message;
  }
};
$("advance").onclick = () => update(draft => {
  const acceptedBefore = draft.orders.filter(order => order.status === "Accepted").length;
  const pickedBefore = draft.orders.filter(order => order.status === "Picked up").length;
  Bakery.acceptAndAdvance(draft);
  const picked = draft.orders.filter(order => order.status === "Picked up").length - pickedBefore;
  const accepted = draft.orders.filter(order => order.status === "Accepted").length - acceptedBefore + picked;
  return "Advanced to " + dateText(draft.today) + ". " + accepted + " accepted · " + picked + " picked up.";
});
render();
