const assert = require("assert");
const path = require("path");
const fs = require("fs");

let latestVersionMap = {};
try {
  latestVersionMap = JSON.parse(fs.readFileSync(`${path.resolve(__dirname)}/../build/contract-type-hash-map.json`));
} catch (error) {
  console.log("WARNING: latest version map was not found in the build directory! Run `yarn build` from core first!");
}

/**
 * Get the version and type of a financial contract deployed using the official UMA contract factories.
 * Note: all inputs and outputs are expressed as fixed-point (scaled by 1e18) BNs.
 * @param {Object} web3 instance. This is passed in to re-use the calling context & network of the entry point.
 * @param {string} contractAddress address of the contract in question
 * @return {Object} contract name & version
 */
async function findContractVersion(contractAddress, web3) {
  assert(web3, "Web3 object must be provided");
  assert(contractAddress, "Contract address must be provided");

  // Note: there is an unknown issue in web3.js that means that the `getCode` syntax does not function correctly in
  // production. However, ethers has proven to work correctly in production. The code below is a patch to still enable
  // this module to work while we find a better long term solution for the web3.js issue. If running within unit tests
  // then the web3.js version is required as it is scope according to the unit test.
  let contractCode;
  if (global.web3) {
    // This is run inside of truffle or hardhat test.
    contractCode = await web3.eth.getCode(contractAddress);
  } else {
    // This is run literally anywhere else.
    const providers = require("ethers").providers;
    const provider = new providers.Web3Provider(web3.currentProvider);
    contractCode = await provider.getCode(contractAddress);
  }

  const contractCodeHash = web3.utils.soliditySha3(contractCode);

  // Return the version from the versionMap OR details on the address,hash & code to help debug a mismatch.
  return (
    versionMap[contractCodeHash] || { contractAddress, contractCodeHash, contractCode: contractCode.substring(0, 1000) }
  );
}

const versionMap = {
  "0xa13e06c4439902742ac1a823744c7f8c201068ab6786d33f218433e55d69b1f2": {
    // Mainnet 1.2.2 ExpiringMultiParty. Used by Yield Dollar and other contracts.
    contractType: "ExpiringMultiParty",
    contractVersion: "1.2.2"
  },
  "0x91a7449c56a485be56bd91515dd5334b73d60371f970ea3750e146c25b65e5b7": {
    // Mainnet 1.2.0 ExpiringMultiParty. Used by expired Yield Dollar.
    contractType: "ExpiringMultiParty",
    contractVersion: "1.2.0"
  },
  "0x7a52b6452a5f68e68a1bbebf66497019194a9fc9533457eeb92043e3d3bbae3b": {
    // 1.2.2 ExpiringMultiParty deployed from hardhat tests.
    contractType: "ExpiringMultiParty",
    contractVersion: "1.2.2"
  },
  "0x1f75b3ae77a4a3b91fefd81264ec94751dcceafb02d42d2250a209385cdee39a": {
    // Latest Mainnet ExpiringMultiParty.
    contractType: "ExpiringMultiParty",
    contractVersion: "latest"
  },
  "0xc0d00c5690d02e8efbb151d8d8f6a85f8c81bdc977fd1cc9cf3fc43d9d96281c": {
    // latest ExpiringMultiParty deployed on Kovan from EMPCreator, which was deployed with Truffle using Hardhat bytecode.
    contractType: "ExpiringMultiParty",
    contractVersion: "latest"
  },
  "0x7202352fa756f41d3b4646441b82271ab44909e6e24c12326fb73f34e6ca2aa9": {
    // Latest Mainnet Perpetual contract.
    contractType: "Perpetual",
    contractVersion: "latest"
  },
  ...latestVersionMap // latest versions built from hard hat. This makes this utility work out of the box with "latest".
};

module.exports = { findContractVersion };
