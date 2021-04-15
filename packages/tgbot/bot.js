const { getBot, checkForContractVersion, getPriceFeedForContract, prettyMRequest, isNumeric } = require("./src/common");
const express = require("express");
const expressApp = express();

const { getWeb3 } = require("@uma/common");
const { markdownv2: tgFormat } = require("telegram-format");

const { MRequest } = require("./src/db");

const web3 = getWeb3();
const bot = getBot();

const PORT = process.env.PORT || 3000;
const URL = process.env.URL || "https://umabottg.herokuapp.com";
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;

const msgs = {
  welcomeMsg: (userId, name) =>
    `Hey ${tgFormat.userMention(name, userId)} \\!\n\n` +
    `My name is ⚔️ ${tgFormat.bold(
      "UMA Notifier Bot"
    )} ⚔️,\nand I track all the positions created on UMA protocol\\. I was created by UMA community and now it's my mission to help all UMA Position Holders against ${tgFormat.bold(
      "Market Fluctuations"
    )}\\. I work day and night rigorously to achieve this goal and I am very excited to help you\n\n` +
    `The process is extremely simple\\.\n\n${tgFormat.bold(
      "1\\. ADD"
    )}\nStart by Adding Monitor request for your position\\.\nTo add monitor request, use\n\n ${tgFormat.monospace(
      "/add EMP_ADDRESS SPONSOR_ADDRESS CR_TRIGGER_VALUE"
    )}\n\nExample: If you want to track ${tgFormat.bold("UGas")} contract of token sponsor ${tgFormat.monospace(
      "0x4a29e88cEA7e1505DB9b6491C749Fb5d6d595265"
    )} and want to be notified if the Collateral Ratio drop below ${tgFormat.bold(
      "10"
    )} then use\n\n ${tgFormat.monospace(
      "/add 0x516f595978D87B67401DaB7AfD8555c3d28a3Af4 0x4a29e88cEA7e1505DB9b6491C749Fb5d6d595265 10"
    )}\n\n You can add multiple monitor requests using the same process shown above\\.\n\n${tgFormat.bold("2\\. LIST")}
Check the number of monitor requests we are tracking for you using /list\\.
\n${tgFormat.bold(
      "3\\. REMOVE"
    )}\nIf you wish to stop monitoring your position use the remove functionality\\.\n\nFirst check the serial number of monitoring request using /list and use
 ${tgFormat.monospace(
   "/remove SERIAL_NUMBER_OF_MONITOR_REQUEST_IN_LIST"
 )}\n\nFor Example: If we want to delete the monitor request with serial number 1 then,
 ${tgFormat.monospace("/remove 1")}\n\n${tgFormat.bold("4\\. UPDATE")}
If you wish to update the CR Trigger for existing Monitor Request the first check the serial number of monitoring request using /list and use /update\n ${tgFormat.monospace(
      "/update <MONITOR_REQUEST_INDEX> <NEW_CR_VALUE>"
    )} \n\nSimple, Isn't it?\nNow you are all set to use  ${tgFormat.bold(
      "UMA Notifier Bot"
    )}\\.\nIf you ever get stuck, use /help to get a list of ${tgFormat.bold(
      "Frequently Asked Questions \\(FAQs\\)"
    )}\n\nBEST OF LUCK\\! 👍`,

  helpMsg: () => `Welcome to the help section of  ${tgFormat.bold("UMA Notifier Bot")} ⚔️\n\n${tgFormat.bold(
    "FAQs"
  )}\n\n${tgFormat.bold(
    "1\\. How can I add multiple requests?"
  )}\nSimply use /add multiple times to add multiple monitor requests\\. Currently there is no upper limit on number of monitor requests you can register\\.
  \n\n${tgFormat.bold(
    "2\\. How can I change the Notification Collateral Ratio\\(NCR\\)?"
  )}\nNotification Collateral Ratio\\(NCR\\) is the ratio below which this bot will send you notifications so that you can mange your positions\\.
If you want to change this variable for existing Monitor Requests then just use /update \\.\n\nIf you want to learn more about UMA Protocol, visit ${tgFormat.url(
    "Official UMA Website",
    "https://docs.umaproject.org/getting\\-started/how\\-uma\\-works"
  )}\\.

${msgs.privacyMsg()}\n

In case you want to talk to us, we are available on ${tgFormat.url("DISCORD", "https://discord.gg/NRU7ScnM")}\\.`,

  privacyMsg: () => `${tgFormat.bold("Privacy Notice")}\\:\\-
All the data this Bot displays is already available in Public domain\\.
When a user adds a monitor request, bot queries on chain data to find the information about the address\\.
All the data is removed from server after user use /remove\\.`,

  invalidInput: () => "Please specify all required fields\\.",

  addSuccess: crAlert =>
    `${tgFormat.bold("Added Successfully")}🤘 \nI will notify you when CR is dropped below ${tgFormat.bold(crAlert)}`,

  invalidCrAlertValue: () => "Please provide a valid integer for CR Trigger 👀",

  invalidSponsorAddress: () => "Given address is not a valid Ethereum address 👀",

  noMRequestsFound: () => "No Monitor Requests Found 🧐",

  removeHelp: () => "Please provide valid request number to remove 👀",

  removeFailed: () => "Failed to remove monitor request 😓",

  removeSuccess: () => tgFormat.bold("Successfully removed 👍"),

  updateHelp: () =>
    tgFormat.bold("Please provide valid monitor request along with new CR value") +
    "\n" +
    tgFormat.monospace("/update <MONITOR_REQUEST_INDEX> <NEW_CR_VALUE>"),

  updateFailed: () => "Failed to update monitor request 😓",

  updateSuccess: () => tgFormat.bold("Successfully updated 👍")
};

bot.start(async ctx => {
  const msg = await ctx.replyWithMarkdownV2(msgs.welcomeMsg(ctx.chat.id, ctx.chat.first_name), {
    disable_web_page_preview: true
  });
  await ctx.unpinAllChatMessages();
  await ctx.pinChatMessage(msg.message_id, { disable_notification: true });
});

bot.help(ctx => ctx.replyWithMarkdownV2(msgs.helpMsg()), { disable_web_page_preview: true });

bot.command("privacy", ctx => ctx.replyWithMarkdownV2(msgs.privacyMsg()), { disable_web_page_preview: true });

bot.command("add", ctx => {
  const data = ctx.message.text.split(" ").slice(1, 4);
  if (data.length < 3) {
    ctx.replyWithMarkdownV2(msgs.invalidInput());
    return;
  }
  const [empAddress, sponsorAddress, crAlert] = data;

  if (!isNumeric(crAlert)) {
    ctx.replyWithMarkdownV2(msgs.invalidCrAlertValue());
    return;
  }

  checkForContractVersion(web3, empAddress, sponsorAddress)
    .then(() =>
      getPriceFeedForContract(web3, empAddress)
        .then(() => {
          const mReq = new MRequest({
            tg_chat_id: ctx.chat.id,
            emp_address: empAddress,
            sponsor_address: sponsorAddress,
            cr_trigger: crAlert
          });
          mReq
            .save()
            .then(() => ctx.replyWithMarkdownV2(prettyMRequest(mReq) + "\n\n" + msgs.addSuccess(crAlert)))
            .catch(console.log);
        })
        .catch(error => ctx.reply("Error while creating price feed for EMP contract\n" + error))
    )
    .catch(error => ctx.replyWithMarkdownV2("Error while checking EMP & Sponsor address\n" + error));
});

bot.command("list", async ctx => {
  mReqs = await (await MRequest.find({ tg_chat_id: ctx.chat.id }).exec()).flat();
  if (mReqs.length == 0) {
    ctx.replyWithMarkdownV2(tgFormat.bold(msgs.noMRequestsFound()));
  } else {
    let tgStr = `Found ${tgFormat.bold(mReqs.length)} monitor requests from you\n\n`;
    mReqs.forEach((item, index) => {
      tgStr += `${tgFormat.bold((index + 1).toString())}\\) ` + prettyMRequest(item) + "\n\n";
    });
    ctx.replyWithMarkdownV2(tgStr);
  }
});

bot.command("remove", async ctx => {
  const data = ctx.message.text.split(" ").slice(1, 2);
  if (data.length < 1) {
    ctx.replyWithMarkdownV2(msgs.removeHelp());
    return;
  }
  const idx = Number(data[0]) - 1;
  mReqs = await (await MRequest.find({ tg_chat_id: ctx.chat.id }).exec()).flat();

  if (0 <= idx && idx <= Number(mReqs.length - 1)) {
    const mReq = mReqs[idx];
    MRequest.deleteOne(mReq, function(err) {
      if (err) {
        console.log(err);
        ctx.replyWithMarkdownV2(msgs.removeFailed());
      } else {
        ctx.replyWithMarkdownV2(prettyMRequest(mReq) + "\n\n" + msgs.removeSuccess());
      }
      // deleted at most one tank document
    });
  } else {
    ctx.replyWithMarkdownV2(msgs.removeHelp());
  }
});

bot.command("update", async ctx => {
  const data = ctx.message.text.split(" ").slice(1, 3);
  if (data.length < 1) {
    ctx.replyWithMarkdownV2(msgs.updateHelp());
    return;
  }
  let [idx, crAlert] = data;

  if (!isNumeric(crAlert) || !isNumeric(idx)) {
    ctx.replyWithMarkdownV2(msgs.invalidCrAlertValue());
    return;
  }
  idx = Number(idx) - 1;
  crAlert = Number(crAlert);

  mReqs = await (await MRequest.find({ tg_chat_id: ctx.chat.id }).exec()).flat();

  if (0 <= idx && idx <= Number(mReqs.length - 1)) {
    const mReq = mReqs[idx];
    mReq.cr_trigger = crAlert;
    try {
      await mReq.save();
      ctx.replyWithMarkdownV2(prettyMRequest(mReq) + "\n\n" + msgs.updateSuccess());
    } catch (err) {
      console.log(err);
      ctx.replyWithMarkdownV2(msgs.updateFailed());
    }
  } else {
    ctx.replyWithMarkdownV2(msgs.removeHelp());
  }
});

// bot.launch();

bot.telegram.setWebhook(`${URL}/bot${TG_BOT_TOKEN}`);
expressApp.use(bot.webhookCallback(`/bot${TG_BOT_TOKEN}`));

expressApp.get("/", (req, res) => {
  res.send("Get well soon, you need help!");
});
expressApp.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
