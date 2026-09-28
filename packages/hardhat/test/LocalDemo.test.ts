import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { isolateClock } from "./helpers/clock";

/**
 * `yarn deploy --network localhost` must leave a market a browser can buy from with no further setup: the deploy
 * scripts themselves (not test helpers) install the HTS, oracle and SaucerSwap stand-ins, register the demo plants,
 * mint one signed hour and list it. This runs those scripts and then buys and retires.
 */
describe("Local demo deploy", function () {
  isolateClock();

  it("ends with a listed batch that a buyer can buy and retire", async function () {
    await deployments.fixture();
    const market = await ethers.getContractAt("CreditMarket", (await deployments.get("CreditMarket")).address);
    const registry = await ethers.getContractAt("DmrvRegistry", (await deployments.get("DmrvRegistry")).address);
    const [, , buyer] = await ethers.getSigners();

    const listing = await market.getListing(0);
    expect(listing.active).to.equal(true);
    expect(listing.unitsAvailable).to.be.gt(0n);

    const quote = await market.quote(0, 10n);
    await expect(market.connect(buyer).buyAndRetire(0, 10n, "local demo", { value: quote })).to.emit(
      market,
      "PurchasedAndRetired",
    );
    expect(await registry.retirementCount()).to.equal(1n);
  });
});
