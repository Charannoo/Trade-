/**
 * scripts/debug-delta.ts — Find correct Delta Exchange India product IDs.
 */
import dotenv from "dotenv";
import path from "path";
import { createHmac } from "crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const API_KEY = process.env.DELTA_API_KEY!;
const API_SECRET = process.env.DELTA_API_SECRET!;
const BASE = "https://api.india.delta.exchange";

function sign(method: string, path: string, body = "") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", API_SECRET)
    .update(method + timestamp + path + body)
    .digest("hex");
  return { signature, timestamp };
}

async function apiGet(endpoint: string) {
  const { signature, timestamp } = sign("GET", endpoint);
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY,
      timestamp,
      signature,
    },
  });
  return res.json();
}

async function main() {
  console.log("Finding perpetual futures products...\n");

  const prods = await apiGet("/v2/products");
  if (!prods.result) {
    console.log("Failed to load products");
    return;
  }

  // Filter for perpetual futures
  const perps = prods.result.filter((p: any) => 
    p.contract_type === "perpetual_futures"
  );

  console.log(`Found ${perps.length} perpetual futures:\n`);
  for (const p of perps) {
    console.log(`  Symbol: ${p.symbol}`);
    console.log(`  ID: ${p.id}`);
    console.log(`  Description: ${p.short_description || p.description}`);
    console.log(`  Type: ${p.contract_type}`);
    console.log(`  Quoting: ${p.quoting_asset?.symbol ?? "N/A"}`);
    console.log("");
  }
}

main().catch(console.error);
