(function () {
  "use strict";

  const products = {
    cupcakes: { unit: "dozen cupcakes", minutes: 30, price: 40 },
    cake: { unit: "cake", minutes: 120, price: 120 }
  };
  const active = order => ["Accepted", "Picked up"].includes(order.status);
  const duration = order => products[order.product].minutes * order.quantity;
  const addDays = (date, days) => {
    const result = new Date(date + "T00:00:00Z");
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
  };
  const validDate = date => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(date + "T00:00:00Z");
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date;
  };
  const hasNotice = (date, submitted) => date >= addDays(submitted, 2);
  const summary = (state, date, excludeId) => {
    const orders = state.orders.filter(order => order.date === date && order.id !== excludeId && active(order));
    const helper = state.helpers.includes(date);
    const booked = orders.reduce((total, order) => total + duration(order), 0);
    const revenue = orders.reduce((total, order) => total + products[order.product].price * order.quantity, 0);
    return { booked, capacity: helper ? 720 : 480, revenue, cost: helper ? 100 : 0, orders };
  };
  const issue = (state, order, submitted, excludeId) => {
    if (!hasNotice(order.date, submitted)) return "Less than 2 days’ notice.";
    const { capacity, booked } = summary(state, order.date, excludeId);
    if (duration(order) > capacity - booked) return "Not enough oven time for this pickup day.";
    return "";
  };

  function fetchMessages(state, messages) {
    for (const message of messages) {
      if (state.inbox.some(entry => entry.id === message.id) || message.sent > state.today) continue;
      const entry = { ...message, result: "" };
      state.inbox.push(entry);
      if (message.type === "new") {
        const order = { id: message.id, customer: message.customer, product: message.product,
          quantity: message.quantity, date: message.date, sent: message.sent };
        order.reason = issue(state, order, message.sent);
        order.status = order.reason ? "Incompatible" : "Requested";
        entry.result = order.status;
        state.orders.push(order);
        continue;
      }

      const order = state.orders.find(item => item.id === message.orderId);
      if (!order || !["Accepted", "Requested", "Incompatible"].includes(order.status)) {
        entry.result = "No open order matches this request.";
      } else if (!hasNotice(order.date, message.sent)) {
        entry.result = "Less than 2 days’ notice for the original pickup.";
      } else if (message.type === "cancel") {
        order.status = "Cancelled";
        order.reason = "";
        entry.result = "Cancelled";
      } else {
        const updated = { ...order, date: message.date, product: message.product, quantity: message.quantity };
        const reason = issue(state, updated, message.sent, order.id);
        if (reason) {
          entry.result = reason;
        } else {
          Object.assign(order, updated, { status: active(order) ? "Accepted" : "Requested", sent: message.sent, reason: "" });
          entry.result = "Changed";
        }
      }
    }
  }

  function acceptOrder(state, id) {
    const order = state.orders.find(item => item.id === id);
    if (!order || !["Requested", "Incompatible"].includes(order.status)) return false;
    order.reason = order.date < state.today ? "Pickup day has passed." : issue(state, order, order.sent);
    order.status = order.reason ? "Incompatible" : "Accepted";
    return order.status === "Accepted";
  }

  function rejectOrder(state, id) {
    const order = state.orders.find(item => item.id === id);
    if (order && ["Requested", "Incompatible"].includes(order.status)) {
      order.status = "Rejected";
      order.reason = "";
    }
  }

  function bookHelper(state, date) {
    if (!hasNotice(date, state.today) || state.helpers.includes(date)) return false;
    state.helpers.push(date);
    return true;
  }

  function acceptAndAdvance(state) {
    for (const order of state.orders) {
      if (["Requested", "Incompatible"].includes(order.status)) acceptOrder(state, order.id);
      if (order.status === "Accepted" && order.date <= state.today) order.status = "Picked up";
    }
    state.today = addDays(state.today, 1);
  }

  function validateMessages(value) {
    if (!Array.isArray(value)) throw new Error("The file must contain an array of messages.");
    const ids = new Set();
    for (const message of value) {
      if (!message || typeof message.id !== "string" || !message.id.trim() || ids.has(message.id)
        || !validDate(message.sent) || !["new", "change", "cancel"].includes(message.type)) {
        throw new Error("Each message needs a unique ID, a valid sent date, and a supported action.");
      }
      ids.add(message.id);
      if (message.type !== "new" && (typeof message.orderId !== "string" || !message.orderId.trim())) {
        throw new Error("Changes and cancellations need an order ID.");
      }
      if (message.type === "new" && (typeof message.customer !== "string" || !message.customer.trim())) {
        throw new Error("New orders need a customer name.");
      }
      if (message.type !== "cancel" && (!Object.hasOwn(products, message.product) || !validDate(message.date)
        || !Number.isSafeInteger(message.quantity) || message.quantity < 1
        || message.quantity > Math.floor(Number.MAX_SAFE_INTEGER / 120))) {
        throw new Error("Orders need a supported product, positive whole quantity, and valid pickup date.");
      }
    }
    return [...value].sort((a, b) => a.sent.localeCompare(b.sent));
  }

  globalThis.Bakery = { products, addDays, hasNotice, summary, duration, issue, fetchMessages, acceptOrder,
    rejectOrder, bookHelper, acceptAndAdvance, validateMessages };
})();
