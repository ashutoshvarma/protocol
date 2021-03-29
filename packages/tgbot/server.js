#!/usr/bin/env node
require("dotenv").config();
const retry = require("async-retry");
const { MRequest } = require("./src/db");

// Clients to retrieve on-chain data and helpers.
const {
  FinancialContractClient,
  Networker,
  Logger,
  createReferencePriceFeedForFinancialContract,
  waitForLogger,
  delay
} = require("@uma/financial-templates-lib");

const { CRMonitor } = require("./src/CRMonitor");

// Contract ABIs and network Addresses.
const { getAbi } = require("@uma/core");
const { getWeb3, findContractVersion } = require("@uma/common");
const { CRMONITOR_STATES, getCommonConfig, checkForContractVersion, getPriceFeedForContract } = require("./src/common");

/**
 * @notice Continuously attempts to monitor contract positions and reports based on monitor modules.
 * @param {Object} logger Module responsible for sending logs.
 * @param {String} financialContractAddress Contract address of the Financial Contract.
 * @param {String} optimisticOracleAddress Contract address of the OptimisticOracle Contract.
 * @param {Number} pollingDelay The amount of seconds to wait between iterations. If set to 0 then running in serverless
 *     mode which will exit after the loop.
 * @param {Number} errorRetries The number of times the execution loop will re-try before throwing if an error occurs.
 * @param {Number} errorRetriesTimeout The amount of milliseconds to wait between re-try iterations on failed loops.
 * @param {Number} startingBlock Offset block number to define where the monitor bot should start searching for events
 *     from. If 0 will look for all events back to deployment of the Financial Contract. If set to null uses current block number.
 * @param {Number} endingBlock Termination block number to define where the monitor bot should end searching for events.
 *     If `null` then will search up until the latest block number in each loop.
 * @param {Object} monitorConfig Configuration object to parameterize all monitor modules.
 * @param {Object} tokenPriceFeedConfig Configuration to construct the tokenPriceFeed (balancer or uniswap) price feed object.
 * @param {Object} medianizerPriceFeedConfig Configuration to construct the reference price feed object.
 * @param {Object} denominatorPriceFeedConfig Configuration to construct the denominator price feed object.
 * @return None or throws an Error.
 */
async function run({ logger, web3, pollingDelay, errorRetries, errorRetriesTimeout, dryRun }) {
  try {
    const { hexToUtf8 } = web3.utils;

    const getTime = () => Math.round(new Date().getTime() / 1000);

    /** *************************************
     *
     * Set variables common to all monitors
     *
     ***************************************/
    const [networkId] = await Promise.all([web3.eth.net.getId(), web3.eth.getBlock("latest")]);

    const checkAll = async () => {
      // cursor are subjected to timeouts, typically 10 mins
      for await (const mReq of MRequest.find()) {
        const financialContractAddress = mReq.emp_address;
        const chatId = mReq.tg_chat_id;
        try {
          const [detectedContract] = await Promise.all([checkForContractVersion(web3, financialContractAddress)]);
          let { contractVersion, contractType } = detectedContract;
          contractVersion = "latest";
          const financialContract = new web3.eth.Contract(
            getAbi(contractType, contractVersion),
            financialContractAddress
          );

          const erc20ABI = getAbi("ERC20");
          const erc20 = new web3.eth.Contract(erc20ABI, await financialContract.methods.tokenCurrency().call());
          const contractName = await erc20.methods.name().call();
          // const contractName = "ABC";

          // We want to enforce that all pricefeeds return prices in the same precision, so we'll construct one price feed
          // initially and grab its precision to pass into the other price feeds:
          const defaultPriceFeed = await getPriceFeedForContract(web3, financialContractAddress);
          await defaultPriceFeed.update();

          const priceFeedDecimals = defaultPriceFeed.getPriceFeedDecimals();
          if (!defaultPriceFeed) {
            throw new Error(`Price feed config is invalid - ${contractName}[${financialContractAddress}]`);
          }

          const [priceIdentifier, collateralTokenAddress, syntheticTokenAddress] = await Promise.all([
            financialContract.methods.priceIdentifier().call(),
            financialContract.methods.collateralCurrency().call(),
            financialContract.methods.tokenCurrency().call()
          ]);
          const collateralToken = new web3.eth.Contract(getAbi("ExpandedERC20"), collateralTokenAddress);
          const syntheticToken = new web3.eth.Contract(getAbi("ExpandedERC20"), syntheticTokenAddress);

          const [collateralSymbol, syntheticSymbol, collateralDecimals, syntheticDecimals] = await Promise.all([
            collateralToken.methods.symbol().call(),
            syntheticToken.methods.symbol().call(),
            collateralToken.methods.decimals().call(),
            syntheticToken.methods.decimals().call()
          ]);

          // Generate Financial Contract properties to inform monitor modules of important info like token symbols and price identifier.
          const financialContractProps = {
            collateralSymbol,
            syntheticSymbol,
            collateralDecimals: Number(collateralDecimals),
            syntheticDecimals: Number(syntheticDecimals),
            priceFeedDecimals,
            priceIdentifier: hexToUtf8(priceIdentifier),
            networkId
          };

          const financialContractClient = new FinancialContractClient(
            logger,
            getAbi(contractType, contractVersion),
            web3,
            financialContractAddress,
            collateralDecimals,
            syntheticDecimals,
            defaultPriceFeed.getPriceFeedDecimals(),
            contractType
          );
          await financialContractClient.update();

          const res = await new CRMonitor({
            logger: logger,
            financialContractClient: financialContractClient,
            priceFeed: defaultPriceFeed,
            mReq: mReq,
            name: contractName,
            chatId: chatId,
            financialContractProps: financialContractProps
          }).checkWalletCrRatio(dryRun);

          switch (res) {
            case CRMONITOR_STATES.SENT:
              logger.debug({
                at: "CRBot#server",
                message: "Notification Sent",
                mReq: mReq
              });
              break;

            case CRMONITOR_STATES.ERROR_NO_POSITION:
            case CRMONITOR_STATES.ERROR_PRICE_FEED:
            case CRMONITOR_STATES.ERROR_NO_TOKEN_OUTSTANDING:
              logger.debug({
                at: "CRBot#server",
                message: "ERROR",
                mReq: mReq
              });
              await MRequest.deleteOne(mReq);
              break;

            case CRMONITOR_STATES.ERROR_UNRESOLVED:
              logger.debug({
                at: "CRBot#server",
                message: "Unresolved Position",
                mReq: mReq
              });
              break;

            default:
              throw new Error(`CRSTATE Error Code - ${res.toString()}`);
          }
        } catch (error) {
          logger.error({
            at: "CRBot#server",
            message: "Error while processing Monitor Request",
            mReq: mReq,
            error: error,
            stack: error.stack
          });
        }
      }
    };

    // Create a execution loop that will run indefinitely (or yield early if in serverless mode)
    for (;;) {
      await retry(checkAll, {
        retries: errorRetries,
        minTimeout: errorRetriesTimeout * 1000, // delay between retries in ms
        onRetry: error => {
          logger.debug({
            at: "CRBot#server",
            message: "An error was thrown in the execution loop - retrying",
            error: typeof error === "string" ? new Error(error) : error
          });
        }
      });
      // If the polling delay is set to 0 then the script will terminate the bot after one full run.
      if (pollingDelay === 0) {
        logger.debug({
          at: "CRBot#server",
          message: "End of serverless execution loop - terminating process"
        });
        await waitForLogger(logger);
        await delay(2); // waitForLogger does not always work 100% correctly in serverless. add a delay to ensure logs are captured upstream.
        break;
      }
      logger.debug({
        at: "CRBot#server",
        message: "End of execution loop - waiting polling delay"
      });
      await delay(Number(pollingDelay));
    }
  } catch (error) {
    // If any error is thrown, catch it and bubble up to the main try-catch for error processing in the Poll function.
    throw typeof error === "string" ? new Error(error) : error;
  }
}
async function Poll(callback) {
  try {
    if (!process.env.COMMON_CONFIG) {
      throw new Error("Bad environment variables! Specify an COMMON_CONFIG,");
    }

    // Deprecate UNISWAP_PRICE_FEED_CONFIG to favor TOKEN_PRICE_FEED_CONFIG, leaving in for compatibility.
    // If nothing defined, it will default to uniswap within createPriceFeed

    // This object is spread when calling the `run` function below. It relies on the object enumeration order and must
    // match the order of parameters defined in the`run` function.
    const executionParameters = {
      // Default to 1 minute delay. If set to 0 in env variables then the script will exit after full execution.
      pollingDelay: process.env.POLLING_DELAY ? Number(process.env.POLLING_DELAY) : 60,
      // Default to 3 re-tries on error within the execution loop.
      errorRetries: process.env.ERROR_RETRIES ? Number(process.env.ERROR_RETRIES) : 3,
      // Default to 1 seconds in between error re-tries.
      errorRetriesTimeout: process.env.ERROR_RETRIES_TIMEOUT ? Number(process.env.ERROR_RETRIES_TIMEOUT) : 1,
      dryRun: process.env.DRY_RUN === "true" ? true : false
    };

    await run({ logger: Logger, web3: getWeb3(), ...executionParameters });
  } catch (error) {
    Logger.error({
      at: "CRBot#server",
      message: "Monitor execution error🚨",
      error: typeof error === "string" ? new Error(error) : error
    });
    await waitForLogger(Logger);
    callback(error);
  }
  callback();
}

function nodeCallback(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  } else process.exit(0);
}

// If called directly by node, execute the Poll Function. This lets the script be run as a node process.
if (require.main === module) {
  Poll(nodeCallback)
    .then(() => {})
    .catch(nodeCallback);
}

// Attach this function to the exported function in order to allow the script to be executed through both truffle and a test runner.
Poll.run = run;
module.exports = Poll;
