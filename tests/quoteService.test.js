import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Job from "../Backend/models/jobModel.js";
import Quote from "../Backend/models/quoteModel.js";
import mongoose from "mongoose";
import * as quoteService from "../Backend/services/quoteService.js";

const originals = new Map();
const replace = (model, key, value) => {
  const id = `${model.modelName}.${key}`;
  if (!originals.has(id)) originals.set(id, [model, key, model[key]]);
  model[key] = value;
};

afterEach(() => {
  for (const [model, key, value] of originals.values()) model[key] = value;
  originals.clear();
});

const job = (overrides = {}) => ({
  _id: "job-1",
  customerID: "customer-1",
  artisanID: null,
  status: "open",
  ...overrides,
});

const validQuote = {
  labourAmount: 10000,
  materialAmount: 2500,
  scope: "Replace the damaged pipe and check the connections.",
  estimatedDuration: "One day",
};

test("createQuote rejects quotes for jobs that are not open", async () => {
  replace(Job, "findById", async () => job({ status: "quote_accepted" }));

  await assert.rejects(quoteService.createQuote("job-1", "artisan-1", validQuote), { statusCode: 400 });
});

test("createQuote prevents the job owner from quoting on their own job", async () => {
  replace(Job, "findById", async () => job());

  await assert.rejects(quoteService.createQuote("job-1", "customer-1", validQuote), { statusCode: 403 });
});

test("createQuote rejects an already expired quote", async () => {
  replace(Job, "findById", async () => job());

  await assert.rejects(
    quoteService.createQuote("job-1", "artisan-1", { ...validQuote, expiresAt: "2000-01-01T00:00:00.000Z" }),
    { statusCode: 400 }
  );
});

test("createQuote computes and persists quote fields for a valid request", async () => {
  let created;
  replace(Job, "findById", async () => job());
  replace(Quote, "findOne", async () => null);
  replace(Quote, "create", async (data) => (created = data));

  await quoteService.createQuote("job-1", "artisan-1", validQuote);

  assert.equal(created.jobID, "job-1");
  assert.equal(created.artisanID, "artisan-1");
  assert.equal(created.labourAmount, validQuote.labourAmount);
  assert.equal(created.materialAmount, validQuote.materialAmount);
});

test("acceptQuote snapshots the accepted agreement and logs it on the job passport", async () => {
  const quoteId = new mongoose.Types.ObjectId();
  const customerId = new mongoose.Types.ObjectId();
  const artisanId = new mongoose.Types.ObjectId();
  const jobId = new mongoose.Types.ObjectId();
  const quote = {
    _id: quoteId,
    jobID: jobId,
    artisanID: artisanId,
    labourAmount: 10000,
    materialAmount: 2500,
    additionalAmount: 500,
    totalAmount: 13000,
    scope: "Replace the damaged pipe and test it.",
    estimatedDuration: "One day",
    guaranteeTerms: "30-day workmanship guarantee",
    status: "pending",
    expiresAt: null,
    save: async function save() { return this; },
  };
  const jobDoc = {
    _id: jobId,
    customerID: customerId,
    status: "open",
    passportEvents: [],
    save: async function save() { return this; },
  };
  const queryFor = (value) => ({
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  replace(Quote, "findById", () => queryFor(quote));
  replace(Quote, "updateMany", async () => ({ modifiedCount: 0 }));
  replace(Job, "findById", () => queryFor(jobDoc));
  const session = { withTransaction: async (callback) => callback(), endSession: async () => {} };
  const originalStartSession = mongoose.startSession;
  mongoose.startSession = async () => session;

  try {
    await quoteService.acceptQuote(quoteId, customerId);
  } finally {
    mongoose.startSession = originalStartSession;
  }

  assert.equal(jobDoc.status, "quote_accepted");
  assert.equal(String(jobDoc.artisanID), String(artisanId));
  assert.equal(String(jobDoc.agreement.quoteID), String(quoteId));
  assert.equal(jobDoc.agreement.totalAmount, 13000);
  assert.equal(jobDoc.agreement.additionalAmount, 500);
  assert.equal(jobDoc.agreement.guaranteeTerms, "30-day workmanship guarantee");
  assert.equal(jobDoc.passportEvents[0].type, "quote_accepted");
});
