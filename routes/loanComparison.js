const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Get all loan offers for comparison
router.get('/offers', async (req, res) => {
  try {
    const db = req.app.locals.db; // Use the existing DB connection
    const offers = await db.collection('offers')
      .find({ status: 'active' })
      .sort({ interestRate: 1 })
      .toArray();
    
    res.json({
      success: true,
      data: offers
    });
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan offers'
    });
  }
});

// Get loan offers by type
router.get('/offers/:loanType', async (req, res) => {
  try {
    const { loanType } = req.params;
    const db = req.app.locals.db; // Use the existing DB connection
    
    const offers = await db.collection('offers')
      .find({ 
        loanType: loanType.toLowerCase(),
        status: 'active'
      })
      .sort({ interestRate: 1 })
      .toArray();
    
    res.json({
      success: true,
      data: offers
    });
  } catch (error) {
    console.error('Error fetching offers by type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan offers'
    });
  }
});

// Compare specific offers
router.post('/compare', async (req, res) => {
  try {
    const { offerIds } = req.body;
    const db = req.app.locals.db; // Use the existing DB connection
    
    const objectIds = offerIds.map(id => new ObjectId(id));
    const offers = await db.collection('offers')
      .find({ _id: { $in: objectIds } })
      .toArray();
    
    res.json({
      success: true,
      data: offers
    });
  } catch (error) {
    console.error('Error comparing offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compare offers'
    });
  }
});

module.exports = router;