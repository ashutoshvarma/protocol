# UMA on Harmony

# <pre>**# Overview**</pre>
Integrate UMA on Harmony so that applications built on Harmony to be able to work with UMA to build synthetic financial products. Developers can deploy any financial
the product that is made possible by UMA.

# <pre>**# Current Deployed System**</pre>
- [Mainnet0 (network id: 1, shard: 0, name: "mainnet0")](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/networks/1.json)
- [Testnet (network id: 2, shard: 0, name: "htestnet0")](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/networks/2.json)

# <pre>**# Setup**</pre>
After completing these setup steps, we'll be ready to start developing on UMA system in Harmony.

### Core

Clone the UMA [repo](https://github.com/ashutoshvarma/protocol). Start in the top-level directory in this repository, `protocol/`.

Checkout to `harmony` branch - `git checkout harmony`

1. Install version 14.x of [Node.js](https://nodejs.org/) and [Yarn](https://classic.yarnpkg.com/) is installed along with it.
2. Run the following in the root of the repo to install all packages from the UMA mono repo:

```bash
yarn
```

We should be able to compile the smart contracts:

```bash
yarn qbuild
```

If everything worked, we should see the line "> Compiled successfully using:" in the output.

### Supported Network

UMA has been deployed to both Harmony Testnet and Mainnet
(Shard 0)

- [Mainnet (network id: 1, shard: 0, name: "mainnet0")](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/networks/1.json)
- [Testnet (network id: 2, shard: 0, name: "htestnet0")](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/networks/2.json)

To switch between networks in truffle use `--network NETWORK_NAME` command-line augment

#### For Example:-

```console
yarn truffle console --network htestnet0   // Start truffle console for testnet
```

### Keys

Export your private key using `PRIVATE_KEY` env

```
export PRIVATE_KEY="YOUR PRIVATE KEY"
```

# <pre>**# UMA Contracts**</pre>

- **Migrations**
- **Finder**
  - Provides addresses of the live contracts
    implementing certain interfaces.
- **VotingToken**
  - Ownership of this token allows a voter to respond to price
    requests. Supports snap-shotting and allows the Oracle to
    mint new tokens as rewards.
- **IdentifierWhitelist**
  - Stores a whitelist of supported identifiers that the oracle can provide prices for.
- **Voting**
  - Voting system for Oracle.
  - Handles receiving and resolving price requests via a commit-reveal
    voting scheme.
- **Registry**
  - Registry for financial contracts and approved financial contract
    creators.
  - Maintains a whitelist of financial contract creators that are allowed
    to register new financial contracts and stores party members of
    financial contract.
- **FinancialContractsAdmin**
  - Admin for financial contracts in the UMA system.
  - Allows appropriately permissioned admin roles to interact with financial
    contracts.
- **Store**
  - An implementation of Store that can accept Oracle fees in ETH or any
    arbitrary ERC20 token.
- **Governor**
  - Takes proposals for certain governance actions and allows UMA token
    holders to vote on them.
- **DesignatedVotingFactory**
  - Factory to deploy new instances of DesignatedVoting and lookup
    previously deployed instances.
- **OptimisticOracle**
  - Optimistic Requester.
- **TestnetERC20**
  - An implementation of ERC20 with the same interface as the Compound project's testnet tokens (mainly DAI) (Just for Testing)
- **TokenFactory**
  - Factory for creating new mintable and burnable tokens.
- **AddressWhitelist**
  - A contract to track a whitelist of addresses.
- **ExpiringMultiPartyLib**
  - Provides convenient Expiring Multi Party contract utilities.
- **ExpiringMultiPartyCreator**
  - Expiring Multi Party Contract creator.
- **WETH9**
- **PerpetualLib**
  - Provides convenient Perpetual Multi Party contract utilities.
- **PerpetualCreator**

# <pre>**# Interacting with Contracts**</pre>

You can interact with deployed contracts using the Truffle console, deployed contracts are automatically
loaded using `truffle-deploy-registry`.

Start the truffle console

```
export PRIVATE_KEY="YOUR_PRIVAT_KEY"
yarn truffle console --network htestnet0
```

**For Example:-**
Check whether "UMATEST" is approved as a valid price identifier.

```
truffle(htestnet0)>  const finder = await Finder.deployed()
truffle(htestnet0)>  const identifierWhitelist = await IdentifierWhitelist.deployed()
truffle(htestnet0)>
truffle(htestnet0)>  const myIdentifier = web3.utils.padRight(web3.utils.utf8ToHex("UMATEST"), 64)
truffle(htestnet0)>  await identifierWhitelist.addSupportedIdentifier(myIdentifier)

```

# <pre>**# Deployed EMPs**</pre>

- ### Testnet

  - **EMP Address** - [0x8c4394c5c1E997BD7cA25605D1c821Cbd37cF534](https://explorer.testnet.harmony.one/#/address/one133pef3wpaxtm6l9z2czarjppe0fheaf59jp3y7)
  - **Synthetic Token Name** - Test UMA Token
  - **Synthetic Symbol** - UMATEST
  - **Price Identifier** - UMATEST
  - **Collateral Currency** - [`TestnetERC20`](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/contracts/common/implementation/TestnetERC20.sol)(Named `DAI`)

- ### Mainnet0
  - **EMP Address** - [0xa42675322870Df548A53FCDb8b389Dd9033B84b7](https://explorer.harmony.one/#/address/0xa42675322870Df548A53FCDb8b389Dd9033B84b7)
  - **Synthetic Token Name** - Test uBTC
  - **Synthetic Symbol** - uBTC_TEST
  - **Price Identifier** - BTC/USD
  - **Collateral Currency** - [`TestnetERC20`](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/contracts/common/implementation/TestnetERC20.sol)


### Test EMP Contracts (Testnet)
#### Setup
Since above contracts use `TestnetERC20` as collateral currency, so I have allocated 10K tokens to both the
accounts given below, so just load the any of the accounts using below private keys.
```
ACCOUNT1=0xae8d1a30160cd8cb112a324a8c918455286ded80ebd4021b2e767ef9a8ebd193
ACCOUNT2=0x8ba492da5a1dbfd05669a2afaef709109d1d41a8fa49a0bc95af5d92e2c55b7a
```

Start the truffle console for testnet
```
$ yarn truffle console --network htestnet0
```

#### Create new tokens from an existing contract

1. Load the EMP Contract
```
truffle(htestnet0)> const emp = await ExpiringMultiParty.at("0x8c4394c5c1E997BD7cA25605D1c821Cbd37cF534")
```

2. We can now create a synthetic token position. We will deposit 150 units of collateral (the first argument) to create 100 units of synthetic tokens (the second argument).

```js
await emp.create({ rawValue: web3.utils.toWei("150") }, { rawValue: web3.utils.toWei("100") })
```

3. Let’s check that we now have synthetic tokens.

<!-- prettier-ignore -->
```js
const syntheticToken = await SyntheticToken.at(await emp.tokenCurrency())
// synthetic token balance. Should equal what we minted in step 2.
(await syntheticToken.balanceOf(accounts[0])).toString()

// Collateral token balance. Should equal original balance minus deposit (150e18).
(await collateralToken.balanceOf(accounts[0])).toString()

// position information. Can see the all key information about our position.
await emp.positions(accounts[0])
```

#### Redeem tokens against a contract

1. Because we are a token sponsor for this synthetic token contract, we can redeem some of the tokens we minted even before the synthetic token expires. Let's redeem half.

```js
await syntheticToken.approve(emp.address, web3.utils.toWei("10000"))
await emp.redeem({ rawValue: web3.utils.toWei("50") })
```

2. Let’s check that our synthetic token balance has decreased and our collateral token balance has increased.
   Because the contract does not have an on-chain price feed to determine the token redemption value for the tokens, it will give us collateral equal to the proportional value value of the total collateral deposited to back the 100 tokens (50/100 \* 150 = 75).

<!-- prettier-ignore -->
```js
// Print balance of collateral token.
(await collateralToken.balanceOf(accounts[0])).toString()

// Print balance of the synthetic token.
(await syntheticToken.balanceOf(accounts[0])).toString()

// position information
await emp.positions(accounts[0])
```

#### Deposit collateral

1. As a token sponsor, we may wish to add additional collateral to our position to avoid being liquidated.
   Let’s deposit 10 additional collateral tokens to our position

<!-- prettier-ignore -->
```js
await emp.deposit({ rawValue: web3.utils.toWei("10") })
(await collateralToken.balanceOf(accounts[0])).toString()
```


# <pre>**# Deploy EMP Financial Product Template**</pre>

1. Open the truffle console and connect it to the network.

```bash
yarn truffle console --network htestnet0
```

2. Create an instance of the ExpiringMultiParty creator (the contract factory for synthetic tokens).
   This command should return “undefined”.

```js
const empCreator = await ExpiringMultiPartyCreator.deployed()
```

3. Define the parameters for the synthetic tokens you would like to create.

Note that in this example, `priceFeedIdentifier`, `syntheticName`, and `syntheticSymbol` are set to "UMATEST", "Test UMA Token", and "UMATEST", respectively. You can choose `priceFeedIdentifier` from approved
[price identifier list](https://github.com/ashutoshvarma/protocol/blob/harmony/packages/core/config/identifiers.json)
and for `syntheticName`, and `syntheticSymbol` you can choose to any names you prefer.

```js
const constructorParams = { expirationTimestamp: "1706780800", collateralAddress: TestnetERC20.address, priceFeedIdentifier: web3.utils.padRight(web3.utils.utf8ToHex("UMATEST"), 64), syntheticName: "Test UMA Token", syntheticSymbol: "UMATEST", collateralRequirement: { rawValue: web3.utils.toWei("1.5") }, disputeBondPercentage: { rawValue: web3.utils.toWei("0.1") }, sponsorDisputeRewardPercentage: { rawValue: web3.utils.toWei("0.1") }, disputerDisputeRewardPercentage: { rawValue: web3.utils.toWei("0.1") }, minSponsorTokens: { rawValue: "100000000000000" }, timerAddress: Timer.address, withdrawalLiveness: 7200, liquidationLiveness: 7200, financialProductLibraryAddress: "0x0000000000000000000000000000000000000000"}
```

4. Now, we can create a new ExpiringMultiParty synthetic token with the factory instance.

```js
const txResult = await empCreator.createExpiringMultiParty(constructorParams)
const emp = await ExpiringMultiParty.at(txResult.logs[0].args.expiringMultiPartyAddress)
```

# <pre>**# Deployment Steps**</pre>

All the truffle migrations configurations are modified for harmony, so its pretty straight to deploy

```
$ yarn truffle migrate  --network htestnet0 --reset --skipDryRun
```

### Note

UMA is a large Repo so sometimes during deployment truffle timeouts or just hangs. In such a case just run each deployment scripts manually in order.
