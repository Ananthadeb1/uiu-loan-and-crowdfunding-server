const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// POST /api/offers - Create a new offer - SIMPLE FIXED VERSION
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

    // Simple validation
    if (!loanId || !borrowerId || !donorId || !offeredAmount || !interestRate || !repaymentTime) {
      return res.status(400).json({ 
        success: false,
        message: "Missing required fields" 
      });
    }

    // Prevent self-bidding
    if (borrowerId === donorId) {
      return res.status(400).json({
        success: false,
        message: "You cannot bid on your own loan request"
      });
    }

    const db = req.app.locals.db;
    const offersCollection = db.collection("offers");
    const loanRequestsCollection = db.collection("loanrequests");

    // Check if loan exists - SIMPLIFIED
    const loan = await loanRequestsCollection.findOne({ 
      _id: new ObjectId(loanId) 
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan request not found"
      });
    }

    // SIMPLE FIX: Allow offers on both 'active' AND 'pending' loans
    if (!['active', 'pending'].includes(loan.status)) {
      return res.status(400).json({
        success: false,
        message: "Cannot make offer on a closed or accepted loan request"
      });
    }

    // Check if donor already made an offer on this loan
    const existingOffer = await offersCollection.findOne({
      loanId: new ObjectId(loanId),
      donorId: donorId,
      status: { $in: ["pending", "accepted"] }
    });

    if (existingOffer) {
      return res.status(400).json({
        success: false,
        message: "You have already made an offer on this loan request"
      });
    }

    // Create offer
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
    console.error("Error creating offer:", error);
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
    
    if (!ObjectId.isValid(loanId)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid loan ID format" 
      });
    }

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

// GET /api/offers/user/:userId/pending - Get pending offers for a user's loans
router.get("/user/:userId/pending", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const db = req.app.locals.db;
    const offersCollection = db.collection("offers");
    
    const offers = await offersCollection.find({ 
      borrowerId: userId,
      status: "pending"
    }).sort({ createdAt: -1 }).toArray();

    return res.json({
      success: true,
      data: offers
    });

  } catch (error) {
    console.error("Error fetching user pending offers:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error fetching pending offers" 
    });
  }
});

// POST /api/offers/:id/accept - Accept offer
router.post("/:id/accept", async (req, res) => {
  try {
    const { id } = req.params;
    const { loanId } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid offer ID format"
      });
    }

    const db = req.app.locals.db;
    const offersCollection = db.collection("offers");
    const loanRequestsCollection = db.collection("loanrequests");

    // Check if loan already has accepted offer
    const existingAcceptedOffer = await offersCollection.findOne({
      loanId: new ObjectId(loanId),
      status: "accepted"
    });

    if (existingAcceptedOffer) {
      return res.status(400).json({
        success: false,
        message: "This loan already has an accepted offer"
      });
    }

    // Accept the offer
    const acceptResult = await offersCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status: "accepted",
          updatedAt: new Date(),
          acceptedAt: new Date()
        } 
      }
    );

    if (acceptResult.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    // Reject all other offers for this loan
    await offersCollection.updateMany(
      { 
        loanId: new ObjectId(loanId),
        _id: { $ne: new ObjectId(id) },
        status: "pending"
      },
      { 
        $set: { 
          status: "rejected",
          updatedAt: new Date(),
          rejectedAt: new Date()
        } 
      }
    );

    // Update loan request status
    await loanRequestsCollection.updateOne(
      { _id: new ObjectId(loanId) },
      { 
        $set: { 
          status: "accepted",
          acceptedOfferId: new ObjectId(id),
          updatedAt: new Date()
        } 
      }
    );

    res.json({
      success: true,
      message: "Offer accepted successfully!",
      data: {
        acceptedOfferId: id
      }
    });

  } catch (error) {
    console.error("Error accepting offer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to accept offer"
    });
  }
});

// GET /api/offers/loan/:loanId/status - Check if loan has accepted offer
router.get("/loan/:loanId/status", async (req, res) => {
  try {
    const { loanId } = req.params;
    
    if (!ObjectId.isValid(loanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID format"
      });
    }

    const db = req.app.locals.db;
    const offersCollection = db.collection("offers");

    const acceptedOffer = await offersCollection.findOne({
      loanId: new ObjectId(loanId),
      status: "accepted"
    });

    res.json({
      success: true,
      data: {
        hasAcceptedOffer: !!acceptedOffer,
        acceptedOffer: acceptedOffer
      }
    });
  } catch (error) {
    console.error("Error checking loan status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check loan status"
    });
  }
});

module.exports = router;