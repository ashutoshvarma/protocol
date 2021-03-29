const { Networker, createReferencePriceFeedForFinancialContract } = require("@uma/financial-templates-lib");
const winston = require("winston");
const { markdownv2: tgFormat } = require("telegram-format");

const { getAbi } = require("@uma/core");
const { getWeb3, findContractVersion, SUPPORTED_CONTRACT_VERSIONS } = require("@uma/common");

const { Telegram, Telegraf } = require("telegraf");
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;

if (TG_BOT_TOKEN === undefined) {
  throw new Error("Please set TG_BOT_TOKEN env.");
}

const DUMMPY_LOGGER = winston.createLogger({
  level: "error",
  transports: [new winston.transports.Console()]
});

const CRMONITOR_STATES = {
  SENT: 0,
  NO_NEED: 7,
  EXPIRED: 1,
  ERROR_PRICE_FEED: 2,
  ERROR_NO_POSITION: 3,
  ERROR_SEND: 4,
  ERROR_UNRESOLVED: 5,
  ERROR_NO_TOKEN_OUTSTANDING: 6
};

const getTime = () => Math.round(new Date().getTime() / 1000);

const getRawTg = () => new Telegram(TG_BOT_TOKEN);

const getBot = () => new Telegraf(TG_BOT_TOKEN);

const getCommonConfig = () => {
  if (!process.env.COMMON_CONFIG) {
    throw new Error("Bad environment variables! Specify an COMMON_CONFIG,");
  }
  return JSON.parse(process.env.COMMON_CONFIG);
};

const prettyMRequest = (mReq, name = "") => {
  const nameStr = `${tgFormat.bold("EMP Name")}: ${tgFormat.monospace(name)}`;
  const emp_line = `${tgFormat.bold("EMP Address")}: ${tgFormat.url(
    mReq.emp_address,
    "https://etherscan.io/address/" + mReq.emp_address
  )}`;
  const sponsor_line = `${tgFormat.bold("Sponsor Address")}: ${tgFormat.url(
    mReq.sponsor_address,
    "https://etherscan.io/address/" + mReq.sponsor_address
  )}`;
  const cr_line = `${tgFormat.bold("CR Alert")}: ${tgFormat.monospace(mReq.cr_trigger)}`;

  const str = emp_line + "\n" + sponsor_line + "\n" + cr_line;
  return name != "" ? nameStr + "\n" + str : str;
};

function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && !isNaN(parseFloat(str)) // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
  ); // ...and ensure strings of whitespace fail
}

async function sendMessageWithMarkdownV2(chat_id, markdown) {
  getRawTg().sendMessage(chat_id, markdown, { parse_mode: "MarkdownV2" });
}

async function checkForContractVersion(web3, financialContractAddress, sponsorAddress) {
  // check for contract version
  const [detectedContract] = await Promise.all([findContractVersion(financialContractAddress, web3)]);
  if (
    SUPPORTED_CONTRACT_VERSIONS.filter(
      vo => vo.contractType == detectedContract.contractType && vo.contractVersion == detectedContract.contractVersion
    ).length == 0
  )
    throw `Contract version specified or inferred is not supported by this bot 🥺\\.\nSupported Versions \\- ${tgFormat.escape(
      JSON.stringify(SUPPORTED_CONTRACT_VERSIONS, null, 2)
    )}`;

  web3.utils.toChecksumAddress(sponsorAddress);

  return detectedContract;
}

async function getPriceFeedForContract(web3, financialContractAddress) {
  // try to make price feed
  const priceFeed = await createReferencePriceFeedForFinancialContract(
    DUMMPY_LOGGER,
    web3,
    new Networker(DUMMPY_LOGGER),
    getTime,
    financialContractAddress,
    getCommonConfig()
  );
  return priceFeed;
}

module.exports = {
  CRMONITOR_STATES: CRMONITOR_STATES,
  getBot,
  getRawTg,
  getCommonConfig,
  checkForContractVersion,
  getPriceFeedForContract,
  sendMessageWithMarkdownV2,
  prettyMRequest,
  isNumeric
};
