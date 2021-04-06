# UMA on Harmony

UMA is fully deployed on Harmony Mainnet (Shard 0)

## Current Deployed System

- [Mainnet0 (network id: 1, shard: 0)](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/networks/1.json)

This will show you how to deploy EMP and create synthetic tokens from the command line for Harmony Mainnet. Before beginning this, please make sure your environment is set up correctly by following the commands :

- Clone the repo
- `yarn`
- `yarn qbuild`
- Create `.env` file like
  ```
  PRIVATE_KEY=<YOUR_MAINNET_PRIVATE_KEY>
  ```

## Parameterize and deploy a EMP contract

1. Open the truffle console and connect it to the test network.

```bash
yarn truffle console --network mainnet0
```

2. Migrate the contracts within the truffle console with the migrate command:

```bash
truffle(mainnet0)> migrate
```

3. Create an instance of the ExpiringMultiParty creator (the contract factory for synthetic tokens).
   This command should return “undefined”.

```js
const empCreator = await ExpiringMultiPartyCreator.deployed()
```

4. Define the parameters for the synthetic tokens you would like to create.

Note that in this example, `priceFeedIdentifier`, is set to "UMATEST" but you can choose any from the following approved [price identifiers on mainnet0]()

<!-- prettier-ignore -->
```js
const constructorParams = { expirationTimestamp: "1706780800", collateralAddress: TestnetERC20.address, priceFeedIdentifier: web3.utils.padRight(web3.utils.utf8ToHex("UMATEST"), 64), syntheticName: "Test UMA Token", syntheticSymbol: "UMATEST", collateralRequirement: { rawValue: web3.utils.toWei("1.5") }, disputeBondPercentage: { rawValue: web3.utils.toWei("0.1") }, sponsorDisputeRewardPercentage: { rawValue: web3.utils.toWei("0.1") }, disputerDisputeRewardPercentage: { rawValue: web3.utils.toWei("0.1") }, minSponsorTokens: { rawValue: '100000000000000' }, timerAddress: '0x0000000000000000000000000000000000000000', withdrawalLiveness: 7200, liquidationLiveness: 7200, financialProductLibraryAddress: '0x0000000000000000000000000000000000000000'}
```

5. Before the contract for the synthetic tokens can be created, the price identifier for the synthetic tokens must be registered with `IdentifierWhitelist`.
   This is important to ensure that the UMA DVM can resolve any disputes for these synthetic tokens.

6) Now, we can create a new ExpiringMultiParty synthetic token with the factory instance.

```js
const txResult = await empCreator.createExpiringMultiParty(constructorParams)
const emp = await ExpiringMultiParty.at(txResult.logs[0].args.expiringMultiPartyAddress)
```

## Create new tokens from an existing contract

1. Now that we’ve parameterized and deployed the synthetic token contract, we will create synthetic tokens from that contract.
   The first step is to create an instance of the Test token and mint 10,000 to the wallet.
   This is the token that will serve as collateral for the synthetic token.
   Give permission to the empCreator to spend the collateral tokens on our behalf.

```js
const collateralToken = await TestnetERC20.deployed()
await collateralToken.allocateTo(accounts[0], web3.utils.toWei("10000"))
await collateralToken.approve(emp.address, web3.utils.toWei("10000"))
```

2. We can now create a synthetic token position. We will deposit 150 units of collateral (the first argument) to create 100 units of synthetic tokens (the second argument).

```js
await emp.create({ rawValue: web3.utils.toWei("150") }, { rawValue: web3.utils.toWei("100") })
```

3. Let’s check that we now have synthetic tokens. We should have 100 synthetic tokens and 9,850 collateral tokens remaining.

<!-- prettier-ignore -->
```js
const syntheticToken = await SyntheticToken.at(await emp.tokenCurrency())
// synthetic token balance. Should equal what we minted in step 2.
(await syntheticToken.balanceOf(accounts[0])).toString()

// Collateral token balance. Should equal original balance (1000e18) minus deposit (150e18).
(await collateralToken.balanceOf(accounts[0])).toString()

// position information. Can see the all key information about our position.
await emp.positions(accounts[0])
```

## Redeem tokens against a contract

1. Because we are a token sponsor for this synthetic token contract, we can redeem some of the tokens we minted even before the synthetic token expires. Let's redeem half.

```js
await syntheticToken.approve(emp.address, web3.utils.toWei("10000"))
await emp.redeem({ rawValue: web3.utils.toWei("50") })
```

2. Let’s check that our synthetic token balance has decreased and our collateral token balance has increased.
   Our synthetic token balance should now be 50.
   Because the contract does not have an on-chain price feed to determine the token redemption value for the tokens, it will give us collateral equal to the proportional value value of the total collateral deposited to back the 100 tokens (50/100 \* 150 = 75).
   Our collateral token balance should increase to 9,925.

<!-- prettier-ignore -->
```js
// Print balance of collateral token.
(await collateralToken.balanceOf(accounts[0])).toString()

// Print balance of the synthetic token.
(await syntheticToken.balanceOf(accounts[0])).toString()

// position information
await emp.positions(accounts[0])
```

## Deposit and withdraw collateral

1. As a token sponsor, we may wish to add additional collateral to our position to avoid being liquidated.
   Let’s deposit 10 additional collateral tokens to our position and see our updated balance, from 9,925 to 9,915.

<!-- prettier-ignore -->
```js
await emp.deposit({ rawValue: web3.utils.toWei("10") })
(await collateralToken.balanceOf(accounts[0])).toString()
```

2. For a token sponsor to withdraw collateral from his position, there are typically 2 ways to do this.
   Read this [explainer](synthetic-tokens/what-are-synthetic-assets.md) for more information.
   In this scenario, because we are the only token sponsor, we will have to withdraw collateral the “slow” way. First, we need to request a withdrawal of 10 collateral tokens.

```js
await emp.requestWithdrawal({ rawValue: web3.utils.toWei("10") })
```

3. Now, we need to simulate the withdrawal liveness period passing without a dispute of our withdrawal request. The `ExpiringMultipartyCreator` used in step 8 has a strict withdrawal liveness of 7200 seconds, or 2 hours. This means that in order for a withdrawal request to be processed _at least_ 2 hours must pass before attempting to withdraw from the position. We can simulate time advancing until after this withdrawal liveness period by using an the deployed instance of `Timer`. This contact acts to simulate time changes within the UMA ecosystem when testing smart contracts.

```js
// Create an instance of the `Timer` Contract
const timer = await Timer.deployed()

// Advance time forward from the current time to current time + 7201 seconds
await timer.setCurrentTime((await timer.getCurrentTime()).toNumber() + 7201)

// Withdraw the now processed request.
await emp.withdrawPassedRequest()
```

4. Let’s now check that our collateral token balance has returned to 9,925.

<!-- prettier-ignore -->
```js
// collateral token balance
(await collateralToken.balanceOf(accounts[0])).toString()
```
