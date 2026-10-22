import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Review from "../Backend/models/reviewModel.js";
import Job from "../Backend/models/jobModel.js";
import ArtisanProfile from "../Backend/models/artisanProfileModel.js";
import * as reviewService from "../Backend/services/reviewService.js";

const originals = new Map();
const replace = (model, key, value) => {
  const id = `${model.modelName}.${key}`;
  if (!originals.has(id)) originals.set(id, [model, key, model[key]]);
  model[key] = value;
};

afterEach(() => {
  for (const [model, key, original] of originals.values()) model[key] = original;
  originals.clear();
});

const jobFixture = (overrides = {}) => ({
  _id: "job-1",
  customerID: "customer-1",
  artisanID: "artisan-1",
  status: "completed",
  ...overrides,
});

const reviewFixture = (overrides = {}) => ({
  _id: "review-1",
  jobID: "job-1",
  customerID: "customer-1",
  artisanID: "artisan-1",
  rating: 4,
  comment: "Good work",
  save: async function save() { return this; },
  deleteOne: async function deleteOne() { return this; },
  ...overrides,
});

const queryReturning = (value) => ({
  populate() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

test("createReview rejects missing jobs", async () => {
  replace(Job, "findById", async () => null);

  await assert.rejects(reviewService.createReview("job-1", "customer-1", { rating: 5 }), { statusCode: 404 });
});

test("createReview only allows the job owner to review", async () => {
  replace(Job, "findById", async () => jobFixture());

  await assert.rejects(reviewService.createReview("job-1", "other-customer", { rating: 5 }), { statusCode: 403 });
});

test("createReview requires a completed job and assigned artisan", async () => {
  replace(Job, "findById", async () => jobFixture({ status: "in_progress" }));

  await assert.rejects(reviewService.createReview("job-1", "customer-1", { rating: 5 }), { statusCode: 400 });
  replace(Job, "findById", async () => jobFixture({ artisanID: null }));
  await assert.rejects(reviewService.createReview("job-1", "customer-1", { rating: 5 }), { statusCode: 400 });
});

test("createReview rejects a duplicate and otherwise creates a review and refreshes rating", async () => {
  replace(Job, "findById", async () => jobFixture());
  replace(Review, "findOne", async () => ({ _id: "existing-review" }));
  await assert.rejects(reviewService.createReview("job-1", "customer-1", { rating: 5 }), { statusCode: 409 });

  replace(Review, "findOne", async () => null);
  const created = reviewFixture({ rating: 5 });
  replace(Review, "create", async () => created);
  replace(Review, "aggregate", async () => [{ average: 4.5, count: 2 }]);
  let aggregateUpdate;
  replace(ArtisanProfile, "updateOne", async (...args) => (aggregateUpdate = args));

  assert.equal(await reviewService.createReview("job-1", "customer-1", { rating: 5, comment: "Excellent" }), created);
  assert.deepEqual(aggregateUpdate[0], { userId: "artisan-1" });
  assert.deepEqual(aggregateUpdate[1].$set, { avgRating: 4.5, totalReviews: 2 });
});

test("updateReview rejects another customer's attempt and refreshes aggregate after owner update", async () => {
  const review = reviewFixture();
  replace(Review, "findById", async () => review);
  await assert.rejects(reviewService.updateReview("review-1", "other-customer", { rating: 2 }), { statusCode: 403 });

  replace(Review, "aggregate", async () => [{ average: 3, count: 1 }]);
  let aggregateUpdate;
  replace(ArtisanProfile, "updateOne", async (...args) => (aggregateUpdate = args));
  const updated = await reviewService.updateReview("review-1", "customer-1", { rating: 3, comment: "Updated" });
  assert.equal(updated.rating, 3);
  assert.equal(updated.comment, "Updated");
  assert.deepEqual(aggregateUpdate[1].$set, { avgRating: 3, totalReviews: 1 });
});

test("deleteReview rejects another customer and clears rating aggregates when last review is deleted", async () => {
  const review = reviewFixture();
  replace(Review, "findById", async () => review);
  await assert.rejects(reviewService.deleteReview("review-1", "other-customer"), { statusCode: 403 });

  replace(Review, "aggregate", async () => []);
  let aggregateUpdate;
  replace(ArtisanProfile, "updateOne", async (...args) => (aggregateUpdate = args));
  assert.deepEqual(await reviewService.deleteReview("review-1", "customer-1"), { message: "Review deleted successfully" });
  assert.deepEqual(aggregateUpdate[1].$set, { avgRating: 0, totalReviews: 0 });
});

test("getReviewOrThrow returns 404 for a missing review", async () => {
  replace(Review, "findById", () => queryReturning(null));

  await assert.rejects(reviewService.getReviewById("missing-review"), { statusCode: 404 });
});
