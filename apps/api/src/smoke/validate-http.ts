import { readFileSync } from "node:fs";
import { validateObservations } from "../contracts/smoke-http.js";

const path = process.argv[2];
if (!path) throw new Error("An isolated synthetic HTTP observation file is required");
console.log(JSON.stringify(validateObservations(JSON.parse(readFileSync(path, "utf8")))));
