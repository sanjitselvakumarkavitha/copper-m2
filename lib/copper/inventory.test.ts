import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake Supabase client, so these tests never touch the real database.
const createStatelessClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createStatelessClient: () => createStatelessClient(),
}));

import { readInventory } from "./inventory";

const row = {
  sku: "CN-NSK",
  product: "Copper Notes",
  color: "Night Sky",
  units_in_stock: 0,
  next_shipment: "2026-11-14",
};

/** A fake client whose query ends with the given result. */
function fakeClient(result: { data: unknown; error: unknown } | Error) {
  const order = async () => {
    if (result instanceof Error) throw result;
    return result;
  };
  return { from: () => ({ select: () => ({ order }) }) };
}

describe("readInventory", () => {
  beforeEach(() => createStatelessClient.mockReset());

  it("returns every row from the inventory table", async () => {
    createStatelessClient.mockReturnValue(fakeClient({ data: [row], error: null }));
    expect(await readInventory()).toEqual([row]);
  });

  it("returns null when Supabase isn't set up", async () => {
    createStatelessClient.mockReturnValue(null);
    expect(await readInventory()).toBeNull();
  });

  it("returns null when the database reports an error", async () => {
    createStatelessClient.mockReturnValue(
      fakeClient({ data: null, error: { message: "boom" } }),
    );
    expect(await readInventory()).toBeNull();
  });

  it("returns null when the request itself throws", async () => {
    createStatelessClient.mockReturnValue(fakeClient(new Error("network down")));
    expect(await readInventory()).toBeNull();
  });
});
