#!/usr/bin/env node

import { run } from "./src/cli.mjs";

run().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
