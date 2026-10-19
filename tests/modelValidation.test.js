import test from "node:test";
import assert from "node:assert/strict";
import Job from "../Backend/models/jobModel.js";
import Quote from "../Backend/models/quoteModel.js";
import Payment from "../Backend/models/payment.js";
import Dispute from "../Backend/models/dispute.js";

test("job schema requires a customer, valid category, and complete location", async () => {
  const job = new Job({
    title: "Small repair",
    description: "A long enough description for a repair request.",
    category: "unknown",
    location: { address: "Address", area: "Area", city: "City" },
  });
  await assert.rejects(job.validate(), (error) => {
    assert.ok(error.errors.customerID);
    assert.ok(error.errors.category);
    return true;
  });
});

test("quote validation calculates total from labour and materials", async () => {
  const quote = new Quote({
    jobID: "507f1f77bcf86cd799439011",
    artisanID: "507f1f77bcf86cd799439012",
    labourAmount: 12345,
    materialAmount: 6789,
    additionalAmount: 1000,
    scope: "Replace the damaged section and test the repair.",
    estimatedDuration: "Two days",
  });

  await quote.validate();
  assert.equal(quote.totalAmount, 20134);
});

test("payment schema rejects fields mismatched from the model contract", async () => {
  const payment = new Payment({
    jobId: "507f1f77bcf86cd799439011",
    costumerId: "507f1f77bcf86cd799439012",
    amount: 12345,
    reference: "isk_test_reference",
  });
  await assert.rejects(payment.validate(), (error) => {
    assert.ok(error.errors.jobID);
    assert.ok(error.errors.customerID);
    return true;
  });
});

test("dispute schema supports multiple evidence records with required participants", async () => {
  const dispute = new Dispute({
    job: "507f1f77bcf86cd799439011",
    customerId: "507f1f77bcf86cd799439012",
    artisanId: "507f1f77bcf86cd799439013",
    raisedBy: "507f1f77bcf86cd799439012",
    reason: "Work quality",
    description: "The agreed repair was not completed.",
    evidence: [{ url: "https://example.test/photo.jpg", note: "Before repair" }],
  });

  await dispute.validate();
  assert.equal(dispute.evidence.length, 1);
});
