
import * as quoteService from "../services/quoteService.js";

export const createQuote = async (req, res) => {
  const quote = await quoteService.createQuote(
    req.params.jobId,
    req.user.id,
    req.body
  );

  return res.status(201).json({
    success: true,
    message: "Quote submitted successfully",
    data: quote,
  });
};

export const getJobQuotes = async (req, res) => {
  const quotes = await quoteService.getJobQuotes(
    req.params.jobId,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    count: quotes.length,
    data: quotes,
  });
};

export const getQuoteById = async (req, res) => {
  const quote = await quoteService.getQuoteById(req.params.id);

  return res.status(200).json({
    success: true,
    data: quote,
  });
};

export const acceptQuote = async (req, res) => {
  const result = await quoteService.acceptQuote(
    req.params.id,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    message: "Quote accepted successfully",
    data: result,
  });
};

export const rejectQuote = async (req, res) => {
  const quote = await quoteService.rejectQuote(
    req.params.id,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    message: "Quote rejected successfully",
    data: quote,
  });
};

export const withdrawQuote = async (req, res) => {
  const quote = await quoteService.withdrawQuote(
    req.params.id,
    req.user.id
  );

  return res.status(200).json({
    success: true,
    message: "Quote withdrawn successfully",
    data: quote,
  });
};