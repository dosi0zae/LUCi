// Fetches a spread-out sample of NVIDIA's Nemotron-Personas-Korea (synthetic Korean people matched to real
// population statistics, https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea) through the public
// Hugging Face datasets-server API, and keeps them in scripts/.cache/personas-raw.json (gitignored).
// Usage: node scripts/fetch-personas.mjs [batches=8] [rowsPerBatch=50]

import fs from "node:fs";
import path from "node:path";

const BATCHES = Number(process.argv[2] ?? 8);
const PER_BATCH = Number(process.argv[3] ?? 50);
const TOTAL = 1_000_000;
const OUT = path.join(process.cwd(), "scripts", ".cache", "personas-raw.json");

fs.mkdirSync(path.dirname(OUT), { recursive: true });

const rows = [];
for (let i = 0; i < BATCHES; i += 1) {
  // Evenly spaced start points with a random shift, so the sample is not one contiguous slab of the file.
  const offset = Math.floor((TOTAL / BATCHES) * i + Math.random() * (TOTAL / BATCHES - PER_BATCH));
  const url = `https://datasets-server.huggingface.co/rows?dataset=nvidia/Nemotron-Personas-Korea&config=default&split=train&offset=${offset}&length=${PER_BATCH}`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`batch ${i} failed: ${response.status}`);
    continue;
  }
  const data = await response.json();
  for (const entry of data.rows ?? []) {
    rows.push(entry.row);
  }
  console.log(`batch ${i}: offset ${offset}, total ${rows.length}`);
}

fs.writeFileSync(OUT, JSON.stringify(rows));
console.log(`saved ${rows.length} personas to ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
