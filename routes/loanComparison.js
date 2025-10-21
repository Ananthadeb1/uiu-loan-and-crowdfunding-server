const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Get loan offers for the current user's loan requests - FIXED VERSION
router.get('/my-offers', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = req.query.userId;
    
    console.log("🔍 [DEBUG] User ID received:", userId);

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // 1. Get ALL loan requests from loanrequests collection (not just active ones)
    const userLoans = await db.collection('loanrequests')
      .find({ userId: userId })
      .toArray();

    console.log("🔍 [DEBUG] Found user loans:", userLoans.length);

    if (userLoans.length === 0) {
      console.log("🔍 [DEBUG] No loan requests found for user");
      return res.json({
        success: true,
        data: [],
        message: 'No loan requests found for this user'
      });
    }

    // 2. Convert loan IDs to ObjectId for querying offers
    const loanIds = userLoans.map(loan => new ObjectId(loan._id));
    console.log("🔍 [DEBUG] Loan IDs to search for:", loanIds);

    // 3. Get ALL offers from offers collection (all statuses)
    const offers = await db.collection('offers')
      .find({ 
        loanId: { $in: loanIds }
        // REMOVED status filter to get ALL offers including accepted/rejected
      })
      .sort({ createdAt: -1 })
      .toArray();

    console.log("🔍 [DEBUG] Found ALL offers for user:", offers.length);

    res.json({
      success: true,
      data: offers,
      userLoansCount: userLoans.length,
      offersCount: offers.length
    });
  } catch (error) {
    console.error('❌ Error fetching user offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your loan offers',
      error: error.message
    });
  }
});

module.exports = router;