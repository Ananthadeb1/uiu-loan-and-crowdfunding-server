const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// POST /api/offers - Create a new offer
router.post("/", async (req, res) => {
  try {
    const {
      loanId,
      loanAmount,
      purpose,
      borrowerId,
      borrowerEmail,
      borrowerName,
      donorId,
      donorEmail,
      donorName,
      offeredAmount,
      interestRate,
      repaymentTime,
      message
    } = req.body;

    // Validation
    if (!loanId || !borrowerId || !donorId || !offeredAmount || !interestRate) {
      return res.status(400).json({ 
        success: false,
        message: "Missing required fields" 
      });
    }

    // Prevent donors from bidding on their own loans
    if (borrowerId === donorId) {
      return res.status(400).json({
        success: false,
        message: "You cannot bid on your own loan request"
      });
    }

    const db = req.app.locals.db;
    const offersCollection = db.collection("offers");

    const offerDoc = {
      loanId: new ObjectId(loanId),
      loanAmount: Number(loanAmount),
      purpose: purpose,
      borrowerId: borrowerId,
      borrowerEmail: borrowerEmail,
      borrowerName: borrowerName,
      donorId: donorId,
      donorEmail: donorEmail,
      donorName: donorName,
      offeredAmount: Number(offeredAmount),
      interestRate: Number(interestRate),
      repaymentTime: Number(repaymentTime),
      message: message || "",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await offersCollection.insertOne(offerDoc);
    
    return res.status(201).json({
      success: true,
      message: "Offer submitted successfully",
      offerId: result.insertedId
    });

  } catch (error) {
    console.error("offerRoutes error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error creating offer" 
    });
  }
});

// GET /api/offers/loan/:loanId - Get all offers for a specific loan
router.get("/loan/:loanId", async (req, res) => {
  try {
    const { loanId } = req.params;
    
    const db = req.app.locals.db;
    const offersCollection = db.collection("offers");
    
    const offers = await offersCollection.find({ 
      loanId: new ObjectId(loanId) 
    }).sort({ createdAt: -1 }).toArray();

    return res.json({
      success: true,
      data: offers
    });

  } catch (error) {
    console.error("Error fetching offers:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error fetching offers" 
    });
  }
});

// GET /api/offers/donor/:donorId - Get all offers by a specific donor
router.get("/donor/:donorId", async (req, res) => {
  try {
    const { donorId } = req.params;
    
    const db = req.app.locals.db;
    const offersCollection = db.collection("offers");
    
    const offers = await offersCollection.find({ 
      donorId: donorId 
    }).sort({ createdAt: -1 }).toArray();

    return res.json({
      success: true,
      data: offers
    });

  } catch (error) {
    console.error("Error fetching donor offers:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error fetching offers" 
    });
  }
});

module.exports = router;