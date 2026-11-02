// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;

/** The rules for calculate_cost's input: anything outside them is rejected. */
export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z.array(z.enum(PRODUCT_IDS)).max(5),
  plan: z.enum(["free", "copper-plus"]),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5),
});

const toCents = (amount: number) => Math.round(amount * 100) / 100;

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const lines: CostBreakdown["lines"] = input.products.map((id) => {
    const product = products.find((p) => p.id === id)!;
    return { item: product.name, usd: toCents(product.priceUsd) };
  });

  // Copper Plus covers the whole household, so it's counted once. The free
  // plan costs nothing, so it adds no line at all.
  const plan = getPlans().find((p) => p.id === input.plan);
  if (plan && plan.id !== "free") {
    const usd =
      input.billing === "monthly"
        ? plan.monthlyUsd * 12 * input.years
        : plan.annualUsd * input.years;
    const years = input.years === 1 ? "1 year" : `${input.years} years`;
    lines.push({
      item: `${plan.name}, ${input.billing}, ${years}`,
      usd: toCents(usd),
    });
  }

  return {
    lines,
    totalUsd: toCents(lines.reduce((sum, line) => sum + line.usd, 0)),
  };
}

/** The rules for check_availability's input: a Copper product, and optionally a color. */
export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: z.enum(PRODUCT_IDS),
    color: z.string().optional(),
  });

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product)!;

  // A color the product doesn't come in is "not a color", whatever the stock.
  let colors = product.colors;
  if (input.color !== undefined) {
    const wanted = input.color.trim().toLowerCase();
    const match = product.colors.find((c) => c.toLowerCase() === wanted);
    if (!match) {
      return {
        status: "not_a_color",
        product: product.name,
        color: input.color,
        colors: product.colors,
      };
    }
    colors = [match];
  }

  const rows = await readInventory();
  if (!rows) {
    return {
      status: "unavailable",
      message:
        "I can't check the shelves right now. Please try again in a moment.",
    };
  }

  const found: Extract<Availability, { status: "ok" }>["colors"] = [];
  for (const color of colors) {
    const row = rows.find(
      (r) =>
        r.product === product.name &&
        r.color.toLowerCase() === color.toLowerCase(),
    );
    if (!row) continue; // no row for this color: leave it out
    const units = row.units_in_stock;
    found.push(
      units === 0
        ? { color, stock: "backordered", restockDate: row.next_shipment }
        : {
            color,
            stock: units < 10 ? "low_stock" : "in_stock",
            restockDate: null,
          },
    );
  }
  return { status: "ok", product: product.name, colors: found };
}

const get_products = tool({
  description:
    "Lists every Copper product with its type, price and the colors it comes in. Says nothing about stock.",
  inputSchema: z.object({}),
  execute: async () => listProducts(),
});

const get_prices = tool({
  description: "Looks up the price of every Copper product and every plan.",
  inputSchema: z.object({}),
  execute: async () => getPrices(),
});

const calculate_cost = tool({
  description:
    "Works out the total cost of 0 to 5 devices plus a plan (free or copper-plus), billed monthly or annually, over 1 to 5 years. Always use this for totals.",
  inputSchema: calculateCostInput,
  execute: async (input) => calculateCost(input),
});

const check_availability = tool({
  description:
    "Checks live stock for a Copper product, for every color or one color: in stock, low stock, or back-ordered with its restock date.",
  inputSchema: checkAvailabilityInput,
  execute: async (input) => checkAvailability(input),
});

/** The tools the model can call. */
export const copperTools: ToolSet = {
  get_products,
  get_prices,
  calculate_cost,
  check_availability,
};
