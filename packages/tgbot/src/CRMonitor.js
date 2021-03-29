// This module is used to monitor a list of addresses and their associated Collateralization ratio.
const { markdownv2: tgFormat } = require("telegram-format");

const {
  ConvertDecimals,
  createFormatFunction,
  createObjectFromDefaultProps,
  createEtherscanLinkMarkdown
} = require("@uma/common");
const { CRMONITOR_STATES, sendMessageWithMarkdownV2, prettyMRequest } = require("./common");

class CRMonitor {
  /**
   * @notice Constructs new Collateral Requirement Monitor.
   * @param {Object} logger Winston module used to send logs.
   * @param {Object} financialContractClient Client used to query Financial Contract status for monitored wallets position info.
   * @param {Object} priceFeed Module used to query the current token price.
   * @param {Object} monitorConfig Object containing an array of wallets to Monitor. Each wallet's `walletName`, `address`,
   * `crAlert` must be given. Example:
   *      { walletsToMonitor: [{ name: "Market Making bot", // Friendly bot name
   *            address: "0x12345",                         // Bot address
   *            crAlert: 1.50 },                            // CR alerting threshold to generate an alert message; 1.5=150%
   *       ...],
   *        logLevelOverrides: {crThreshold: "error"}       // Log level overrides
   *      };
   * @param {Object} financialContractProps Configuration object used to inform logs of key Financial Contract information. Example:
   *      { collateralDecimals: 18,
            syntheticDecimals: 18,
            priceFeedDecimals: 18,
            priceIdentifier: "ETH/BTC",
            networkId:1 }
   */
  constructor({ logger, financialContractClient, priceFeed, mReq, name, chatId, financialContractProps }) {
    this.logger = logger;

    this.financialContractClient = financialContractClient;
    // await this.financialContractClient.update();

    this.web3 = this.financialContractClient.web3;

    // Offchain price feed to compute the current collateralization ratio for the monitored positions.
    this.priceFeed = priceFeed;
    this.mReq = mReq;
    // await this.priceFeed.update();

    this.address = mReq.sponsor_address;
    this.crAlert = mReq.cr_trigger;
    this.name = name;
    this.chatId = chatId;

    // Define a set of normalization functions. These Convert a number delimited with given base number of decimals to a
    // number delimited with a given number of decimals (18). For example, consider normalizeCollateralDecimals. 100 BTC
    // is 100*10^8. This function would return 100*10^18, thereby converting collateral decimals to 18 decimal places.
    this.normalizeCollateralDecimals = ConvertDecimals(financialContractProps.collateralDecimals, 18, this.web3);
    this.normalizeSyntheticDecimals = ConvertDecimals(financialContractProps.syntheticDecimals, 18, this.web3);
    this.normalizePriceFeedDecimals = ConvertDecimals(financialContractProps.priceFeedDecimals, 18, this.web3);

    this.formatDecimalString = createFormatFunction(this.web3, 2, 4, false);

    // Validate the financialContractProps object. This contains a set of important info within it so need to be sure it's structured correctly.
    const defaultFinancialContractProps = {
      financialContractProps: {
        value: {},
        isValid: x => {
          // The config must contain the following keys and types:
          return (
            Object.keys(x).includes("priceIdentifier") &&
            typeof x.priceIdentifier === "string" &&
            Object.keys(x).includes("collateralDecimals") &&
            typeof x.collateralDecimals === "number" &&
            Object.keys(x).includes("syntheticDecimals") &&
            typeof x.syntheticDecimals === "number" &&
            Object.keys(x).includes("priceFeedDecimals") &&
            typeof x.priceFeedDecimals === "number" &&
            Object.keys(x).includes("networkId") &&
            typeof x.networkId === "number"
          );
        }
      }
    };
    Object.assign(this, createObjectFromDefaultProps({ financialContractProps }, defaultFinancialContractProps));

    // Helper functions from web3.
    this.toBN = this.web3.utils.toBN;
    this.toWei = this.web3.utils.toWei;

    this.fixedPointAdjustment = this.toBN(this.toWei("1"));
  }

  // Queries all monitored wallet ballance for collateralization ratio against a given threshold.
  async checkWalletCrRatio(dryRun = false) {
    // yield the price feed at the current time.
    // console.log({ priceFeed: this.priceFeed.priceFeeds });
    const price = this.priceFeed.getCurrentPrice();
    const latestCumulativeFundingRateMultiplier = this.financialContractClient.getLatestCumulativeFundingRateMultiplier();

    if (!price) {
      this.logger.warn({
        at: "CRMonitor",
        message: "Cannot compute wallet collateralization ratio because price feed returned invalid value"
      });
      await sendMessageWithMarkdownV2(
        this.chatId,
        "Pricefeed for you EMP is not working ☹️\\.\nPlease try to add again, if problem persists contact community support\n\n" +
          prettyMRequest(this.mReq, this.name) +
          `\n\n${tgFormat.bold("Removing above monitor request")}`
      );
      return CRMONITOR_STATES.ERROR_PRICE_FEED;
    }

    const monitoredAddress = this.web3.utils.toChecksumAddress(this.address);

    const positionInformation = this._getPositionInformation(monitoredAddress);
    if (positionInformation == null) {
      // if (positionInformation != null) {
      // There is no position information for the given wallet. Next run this will be updated as it is now enqueued.
      await sendMessageWithMarkdownV2(
        this.chatId,
        "No active position found for given sponsor address ☹️\\.\n\n" +
          prettyMRequest(this.mReq, this.name) +
          `\n\n${tgFormat.bold("Removing above monitor request")}`
      );
      return CRMONITOR_STATES.ERROR_NO_POSITION;
    }

    // Note the collateral amount below already considers the latestCumulativeFundingRateMultiplier from the client.
    // No additional calculation should be required as a result.
    const collateral = positionInformation.amountCollateral;
    const withdrawalRequestAmount = positionInformation.withdrawalRequestAmount;
    const tokensOutstanding = positionInformation.numTokens;

    // If the values for collateral or price have yet to resolve, dont push a notification.
    if (collateral == null || tokensOutstanding == null) {
      return CRMONITOR_STATES.ERROR_UNRESOLVED;
    }

    // Subtract requested withdrawal amount from position
    const backingCollateral = this.toBN(collateral)
      .sub(this.toBN(withdrawalRequestAmount))
      .toString();

    // If CR = null then there are no tokens outstanding and so dont push a notification.
    const positionCR = this._calculatePositionCR(backingCollateral, tokensOutstanding, price);
    if (positionCR == null) {
      await sendMessageWithMarkdownV2(
        this.chatId,
        "No token outstanding for given sponsor address ☹️\\.\n\n" +
          prettyMRequest(this.mReq, this.name) +
          `\n\n${tgFormat.bold("Removing above monitor request")}`
      );
      return CRMONITOR_STATES.ERROR_NO_TOKEN_OUTSTANDING;
    }

    // Lastly, if we have gotten a position CR ratio this can be compared against the threshold. If it is below the
    // threshold then push the notification.
    if (this._ltThreshold(positionCR, this.toWei(this.crAlert.toString()))) {
      const liquidationPrice = this._calculatePriceForCR(
        backingCollateral,
        tokensOutstanding,
        this.financialContractClient.collateralRequirement
      );

      // Sample message:
      // Risk alert: [Tracked wallet name] has fallen below [threshold]%.
      // Current [name of identifier] value: [current identifier value].
      const mrkdwn =
        this.name +
        " (" +
        monitoredAddress +
        ") collateralization ratio has dropped to " +
        this.formatDecimalString(positionCR.muln(100)) + // Scale up the CR threshold by 100 to become a percentage
        "% which is below the " +
        this.crAlert * 100 +
        "% threshold. Current value of " +
        this.financialContractProps.priceIdentifier +
        " is " +
        this.formatDecimalString(this.normalizePriceFeedDecimals(price)) +
        ". The collateralization requirement is " +
        this.formatDecimalString(this.financialContractClient.collateralRequirement.muln(100)) +
        "%. Liquidation price: " +
        this.formatDecimalString(liquidationPrice) + // Note that this does NOT use normalizePriceFeedDecimals as the value has been normalized from the _calculatePriceForCR equation.
        ". The latest cumulative funding rate multiplier is " +
        this.formatDecimalString(latestCumulativeFundingRateMultiplier);
      +".";

      const markdown =
        tgFormat.bold("Alert ❗️") +
        "\n" +
        `Position of sponsor ${tgFormat.url(
          monitoredAddress,
          "https://etherscan.io/address/" + monitoredAddress
        )} is in danger of liquidation\\.` +
        "\n" +
        `Current CR is ${tgFormat.bold(tgFormat.escape(this.formatDecimalString(positionCR)))} which is below the ${
          this.mReq.cr_trigger
        } threshold\\.` +
        "\n\n" +
        `${tgFormat.bold("EMP Name: ")} ${tgFormat.escape(this.name)}` +
        "\n" +
        tgFormat.bold(`Token Price \\(${tgFormat.escape(this.financialContractProps.priceIdentifier)}\\): `) +
        tgFormat.escape(this.formatDecimalString(this.normalizePriceFeedDecimals(price))) +
        "\n" +
        tgFormat.bold("CR Requirement: ") +
        tgFormat.escape(this.formatDecimalString(this.financialContractClient.collateralRequirement)) +
        "\n" +
        tgFormat.bold("Liquidation Price: ") +
        tgFormat.escape(this.formatDecimalString(liquidationPrice)) +
        "\n" +
        tgFormat.bold("Cumulative Funding Rate Multiplier: ") +
        tgFormat.escape(this.formatDecimalString(latestCumulativeFundingRateMultiplier));

      console.log(markdown);

      const [status] = dryRun
        ? [CRMONITOR_STATES.SENT]
        : await Promise.all([
            sendMessageWithMarkdownV2(this.chatId, markdown)
              .then(res => CRMONITOR_STATES.SENT)
              .catch(err => CRMONITOR_STATES.ERROR_SEND)
          ]);
      return status;
    } else {
      return CRMONITOR_STATES.NO_NEED;
    }
  }

  _getPositionInformation(address) {
    return this.financialContractClient.getAllPositions().find(position => position.sponsor === address);
  }

  // Checks if a big number value is below a given threshold.
  _ltThreshold(value, threshold) {
    // If the price has not resolved yet then return false.
    if (value == null) {
      return false;
    }
    return this.toBN(value).lt(this.toBN(threshold));
  }

  // Calculate the collateralization Ratio from the collateral, token amount and token price
  // This is cr = (collateral - withdrawalRequestAmount) / (tokensOutstanding * price)
  _calculatePositionCR(collateral, tokensOutstanding, tokenPrice) {
    if (collateral == 0) {
      return 0;
    }
    if (tokensOutstanding == 0) {
      return null;
    }
    return this.normalizeCollateralDecimals(collateral)
      .mul(this.fixedPointAdjustment.mul(this.fixedPointAdjustment))
      .div(this.normalizeSyntheticDecimals(tokensOutstanding).mul(this.normalizePriceFeedDecimals(tokenPrice)));
  }

  _calculatePriceForCR(collateral, tokensOutstanding, collateralRequirement) {
    return this.normalizeCollateralDecimals(collateral)
      .mul(this.fixedPointAdjustment.mul(this.fixedPointAdjustment))
      .div(this.normalizeSyntheticDecimals(tokensOutstanding).mul(this.toBN(collateralRequirement)));
  }
}

module.exports = { CRMonitor };
