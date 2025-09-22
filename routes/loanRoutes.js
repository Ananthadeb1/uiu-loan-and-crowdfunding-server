const express = require("express");
const { ObjectId } = require("mongodb");

// If you already use Mongoose, you can switch to a model; here we'll keep it simple and use the native client passed from index via req.app.locals if desired.
// For now, store into Mongo via the native driver using the same DB used in index.js.

const router = express.Router();

// This route expects index.js to have connected to Mongo and to expose the DB via req.app.locals.db or we can reuse the same connect helper.
// Simpler: accept the client from index by closure is hard here, so we'll create a tiny middleware that gets a collection each request.

router.post("/", async (req, res) => {
  try {
    const { loanAmount, purpose, repaymentTime, requestedAt } = req.body;

    if (!loanAmount || !purpose || !repaymentTime) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Use the same DB name as users: "peerFund"
    const client = req.app.locals.mongoClient;
    const collection = client.db("peerFund").collection("loanrequests");

    const doc = {
      loanAmount: Number(loanAmount),
      purpose: String(purpose).trim(),
      repaymentTime: Number(repaymentTime),
      requestedAt: requestedAt ? new Date(requestedAt) : new Date()
    };

    const result = await collection.insertOne(doc);
    return res.status(201).json({ message: "Loan request submitted", id: result.insertedId });
  } catch (e) {
    console.error("loanRoutes error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
