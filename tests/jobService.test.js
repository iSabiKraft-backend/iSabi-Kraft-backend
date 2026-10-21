import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Job from "../Backend/models/jobModel.js";
import * as jobService from "../Backend/services/jobService.js";

const original = {};

const replace = (key, value) => {
  original[key] ??= Job[key];
  Job[key] = value;
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) Job[key] = value;
  for (const key of Object.keys(original)) delete original[key];
});

const jobFixture = (overrides = {}) => ({
  _id: "job-1",
  customerID: "customer-1",
  artisanID: null,
  status: "open",
  title: "Repair kitchen sink",
  description: "The kitchen sink is leaking and needs repairs soon.",
  category: "plumbing",
  location: { address: "12 Example Road", area: "Ikeja", city: "Lagos" },
  save: async function save() { return this; },
  ...overrides,
});

test("createJob uses the authenticated customer and expected input fields", async () => {
  let saved;
  replace("create", async (data) => (saved = data));
  const input = {
    title: "Repair kitchen sink",
    description: "The kitchen sink is leaking and needs repairs soon.",
    category: "plumbing",
    location: jobFixture().location,
    customerID: "attacker-controlled-value",
    status: "completed",
  };

  await jobService.createJob("customer-1", input);

  assert.equal(saved.customerID, "customer-1");
  assert.equal(saved.status, undefined);
  assert.equal(saved.title, input.title);
});

test("getJobById rejects a customer who is not a participant", async () => {
  const job = jobFixture({ status: "in_progress", artisanID: "artisan-1" });
  replace("findById", () => ({
    populate() { return this; },
    then(resolve) { return Promise.resolve(job).then(resolve); },
  }));

  await assert.rejects(
    jobService.getJobById("job-1", { id: "other-customer", role: "customer" }),
    { statusCode: 403 }
  );
});

test("getJobById permits an artisan to inspect an open job", async () => {
  const job = jobFixture();
  replace("findById", () => ({
    populate() { return this; },
    then(resolve) { return Promise.resolve(job).then(resolve); },
  }));

  assert.equal(await jobService.getJobById("job-1", { id: "artisan-1", role: "artisan" }), job);
});

test("cancelJob refuses to cancel a job outside cancellable states", async () => {
  replace("findById", async () => jobFixture({ status: "in_progress" }));

  await assert.rejects(jobService.cancelJob("job-1", "customer-1"), { statusCode: 400 });
});
