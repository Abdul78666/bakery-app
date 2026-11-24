(function () {
  const monday = "2026-11-23";
  const date = offset => Bakery.addDays(monday, offset);
  const seed = [
    ["Kim", 0, "cupcakes", 4], ["Ross", 0, "cake", 1],
    ["Ali", 1, "cupcakes", 6], ["Diaz", 1, "cake", 1],
    ["Fox", 2, "cupcakes", 4], ["Ng", 3, "cupcakes", 6],
    ["Brown", 3, "cupcakes", 2], ["Silva", 3, "cake", 1],
    ["Wong", 4, "cake", 1], ["Chen", 4, "cupcakes", 6],
    ["Haddad", 5, "cake", 1], ["Moreau", 5, "cupcakes", 4]
  ];
  globalThis.createBakery = () => ({
    today: monday, helpers: [], inbox: [],
    orders: seed.map(([customer, offset, product, quantity]) => ({
      id: customer.toLowerCase(), customer, date: date(offset), product, quantity, status: "Accepted"
    }))
  });
})();
