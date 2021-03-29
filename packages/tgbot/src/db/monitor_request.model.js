"use strict";

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MRequestSchema = new Schema({
  tg_chat_id: { type: String, required: true },
  emp_address: { type: String, required: true },
  sponsor_address: { type: String, required: true },
  cr_trigger: { type: String, required: true }
});

const MRequest = mongoose.model("MRequest", MRequestSchema);

module.exports = {
  MRequest
};
