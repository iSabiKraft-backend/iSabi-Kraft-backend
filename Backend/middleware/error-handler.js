const errorHandler = (err, _req, res, _next) => {
  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: Object.values(err.errors)
        .map((e) => e.message)
        .join(", "),
    });
  }
  if (err.name === "CastError")
    return res.status(400).json({ message: "Invalid id" });
  if (err.code === 11000)
    return res.status(409).json({ message: "Duplicate record" });

  const status =
    err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
  if (status === 500) console.error(err);
  res
    .status(status)
    .json({ message: status === 500 ? "Something went wrong" : err.message });
};

export default errorHandler;
