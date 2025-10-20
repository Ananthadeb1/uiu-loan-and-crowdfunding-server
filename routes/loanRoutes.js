const express = require("express");
const { ObjectId } = require("mongodb");
const router = express.Router();

// POST /api/loans - Create a new loan request
router.post("/", async (req, res) => {
  try {
    const { loanAmount, purpose, repaymentTime, requestedAt, userId, userEmail, userName, description } = req.body;

    // Validation
    if (!loanAmount || !purpose || !repaymentTime || !userId) {
      return res.status(400).json({ 
        success: false,
        message: "Missing required fields: loanAmount, purpose, repaymentTime, and userId are required" 
      });
    }

    // Additional validation
    if (loanAmount < 1000) {
      return res.status(400).json({
        success: false,
        message: "Minimum loan amount is 1000 TK"
      });
    }

    if (loanAmount > 1000000) {
      return res.status(400).json({
        success: false,
        message: "Maximum loan amount is 1,000,000 TK"
      });
    }

    if (repaymentTime < 1 || repaymentTime > 60) {
      return res.status(400).json({
        success: false,
        message: "Repayment time must be between 1 and 60 months"
      });
    }

    const db = req.app.locals.db;

    // Check if user exists and is not a donor
    const userCollection = db.collection("users");
    const user = await userCollection.findOne({ uid: userId });
    
    if (user && user.role === "donor") {
      return res.status(403).json({ 
        success: false,
        message: "Donors cannot submit loan requests. Please use a regular user account." 
      });
    }

    const loanCollection = db.collection("loanrequests");

    // Check if user has too many pending loans (optional feature)
    const pendingLoans = await loanCollection.countDocuments({ 
      userId: userId, 
      status: "pending" 
    });

    if (pendingLoans >= 3) {
      return res.status(400).json({
        success: false,
        message: "You have reached the maximum limit of 3 pending loan requests"
      });
    }

    const doc = {
      loanAmount: Number(loanAmount),
      purpose: String(purpose).trim(),
      repaymentTime: Number(repaymentTime),
      userId: userId,
      userEmail: userEmail,
      userName: userName,
      description: description || "",
      requestedAt: requestedAt ? new Date(requestedAt) : new Date(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await loanCollection.insertOne(doc);
    
    return res.status(201).json({ 
      success: true,
      message: "Loan request submitted successfully", 
      id: result.insertedId,
      data: doc
    });

  } catch (error) {
    console.error("loanRoutes error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error processing loan request" 
    });
  }
});

// GET /api/loans - Get all loan requests (for loan bidding page)
router.get("/", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const loanCollection = db.collection("loanrequests");
    
    // Get only pending loan requests
    const loans = await loanCollection.find({ 
      status: "pending" 
    }).sort({ createdAt: -1 }).toArray();

    return res.json({
      success: true,
      data: loans,
      count: loans.length
    });

  } catch (error) {
    console.error("Error fetching loans:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error fetching loan requests" 
    });
  }
});

// GET /api/loans/user/:userId - Get loan requests by specific user
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const db = req.app.locals.db;
    const loanCollection = db.collection("loanrequests");
    
    const loans = await loanCollection.find({ 
      userId: userId 
    }).sort({ createdAt: -1 }).toArray();

    return res.json({
      success: true,
      data: loans
    });

  } catch (error) {
    console.error("Error fetching user loans:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error fetching user loan requests" 
    });
  }
});

// GET /api/loans/:id - Get specific loan request
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid loan ID format" 
      });
    }

    const db = req.app.locals.db;
    const loanCollection = db.collection("loanrequests");
    
    const loan = await loanCollection.findOne({ _id: new ObjectId(id) });

    if (!loan) {
      return res.status(404).json({ 
        success: false,
        message: "Loan request not found" 
      });
    }

    return res.json({
      success: true,
      data: loan
    });

  } catch (error) {
    console.error("Error fetching loan:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error fetching loan request" 
    });
  }
});

// PATCH /api/loans/:id - Update loan status
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid loan ID format" 
      });
    }

    const validStatuses = ["pending", "approved", "rejected", "funded", "completed", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: "Valid status is required" 
      });
    }

    const db = req.app.locals.db;
    const loanCollection = db.collection("loanrequests");

    const result = await loanCollection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status: status,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Loan request not found" 
      });
    }

    return res.json({
      success: true,
      message: `Loan request ${status} successfully`
    });

  } catch (error) {
    console.error("Error updating loan:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error updating loan request" 
    });
  }
});

// DELETE /api/loans/:id - Delete loan request
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid loan ID format" 
      });
    }

    const db = req.app.locals.db;
    const loanCollection = db.collection("loanrequests");

    const result = await loanCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Loan request not found" 
      });
    }

    return res.json({
      success: true,
      message: "Loan request deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting loan:", error);
    return res.status(500).json({ 
      success: false,
      message: "Server error deleting loan request" 
    });
  }
});

module.exports = router;