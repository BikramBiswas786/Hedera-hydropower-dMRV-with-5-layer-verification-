/**
 * `deployedContracts.local.ts` is gitignored. A fresh clone still has to import it.
 * Create the empty module unless a localhost deploy already wrote one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "../contracts/deployedContracts.local.ts");
const stub = `/**
 * Local Hardhat deploy (chain 31337). \`yarn deploy --network localhost\` overwrites this file.
 * Gitignored. Empty until that deploy. \`yarn test\` does not read it.
 */
import type { GenericContractsDeclaration } from "~~/utils/scaffold-hbar/contract";

const localDeployedContracts = {} as const;

export default localDeployedContracts satisfies GenericContractsDeclaration;
`;

const reset = process.argv.includes("--reset");
if (reset || !fs.existsSync(target)) {
  fs.writeFileSync(target, stub);
  console.log(`${reset ? "Reset" : "Created"} ${path.relative(process.cwd(), target)}`);
}
