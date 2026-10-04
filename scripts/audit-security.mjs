import { spawnSync } from "node:child_process";

// Only the unpatched build-time braces advisory is temporarily accepted.
const accepted = new Set(["https://github.com/advisories/GHSA-vfj7-8cjw-p6xm"]);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["audit", "--json"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
if (result.error) throw result.error;
let audit;
try { audit = JSON.parse(result.stdout); } catch { throw new Error(result.stderr || "Invalid npm audit response"); }
if (audit.error || !audit.vulnerabilities) throw new Error(JSON.stringify(audit.error || audit));
const advisories = Object.values(audit.vulnerabilities).flatMap(entry => entry.via.filter(via => typeof via === "object"));
const unexpected = advisories.filter(advisory => !accepted.has(advisory.url));
console.log(JSON.stringify(audit.metadata.vulnerabilities, null, 2));
if (unexpected.length) {
  console.error("Unaccepted dependency advisories:", unexpected);
  process.exit(1);
}
if (result.status !== 0 && !advisories.length) throw new Error("npm audit failed without advisory details");
console.log("Security check passed; only the documented unpatched build-time advisory is accepted.");
