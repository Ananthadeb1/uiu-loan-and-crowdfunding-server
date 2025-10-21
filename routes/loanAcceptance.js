const express = require('express');
const { ObjectId } = require('mongodb');
const router = express.Router();

// Check if a loan already has an accepted offer
router.get('/loan/:loanId/status', async (req, res) => {
  try {
    const { loanId } = req.params;
    
    if (!ObjectId.isValid(loanId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid loan ID format'
      });
    }

    const db = req.app.locals.db;
    const offersCollection = db.collection('offers');

    // Check if any offer is already accepted for this loan
    const acceptedOffer = await offersCollection.findOne({
      loanId: new ObjectId(loanId),
      status: 'accepted'
    });

    res.json({
      success: true,
      data: {
        hasAcceptedOffer: !!acceptedOffer,
        acceptedOffer: acceptedOffer
      }
    });
  } catch (error) {
    console.error('Error checking loan acceptance status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check loan acceptance status'
    });
  }
});

// Get user's accepted offers across all loans
router.get('/user/:userId/accepted-offers', async (req, res) => {
  try {
    const { userId } = req.params;

    const db = req.app.locals.db;
    const offersCollection = db.collection('offers');

    // Get all accepted offers for this user's loans
    const acceptedOffers = await offersCollection.find({
      borrowerId: userId,
      status: 'accepted'
    }).sort({ updatedAt: -1 }).toArray();

    res.json({
      success: true,
      data: acceptedOffers
    });
  } catch (error) {
    console.error('Error fetching accepted offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accepted offers'
    });
  }
});

// Enhanced accept offer with database-level locking
router.post('/offers/:offerId/accept', async (req, res) => {
  const session = req.app.locals.db.startSession();
  
  try {
    const { offerId } = req.params;
    const { loanId } = req.body;

    if (!ObjectId.isValid(offerId) || !ObjectId.isValid(loanId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offer ID or loan ID format'
      });
    }

    await session.withTransaction(async () => {
      const db = req.app.locals.db;
      const offersCollection = db.collection('offers');
      const loanRequestsCollection = db.collection('loanrequests');

      // Step 1: Check if loan already has an accepted offer (DATABASE LEVEL CHECK)
      const existingAcceptedOffer = await offersCollection.findOne({
        loanId: new ObjectId(loanId),
        status: 'accepted'
      }, { session });

      if (existingAcceptedOffer) {
        throw new Error('This loan already has an accepted offer. Cannot accept another offer.');
      }

      // Step 2: Verify the offer exists and is pending
      const offer = await offersCollection.findOne({
        _id: new ObjectId(offerId),
        status: 'pending'
      }, { session });

      if (!offer) {
        throw new Error('Offer not found or not available for acceptance');
      }

      // Step 3: Accept the selected offer
      const acceptResult = await offersCollection.updateOne(
        { _id: new ObjectId(offerId) },
        { 
          $set: { 
            status: 'accepted',
            updatedAt: new Date(),
            acceptedAt: new Date()
          } 
        },
        { session }
      );

      if (acceptResult.modifiedCount === 0) {
        throw new Error('Failed to accept offer');
      }

      // Step 4: Reject all other offers for this loan
      const rejectResult = await offersCollection.updateMany(
        { 
          loanId: new ObjectId(loanId),
          _id: { $ne: new ObjectId(offerId) },
          status: 'pending'
        },
        { 
          $set: { 
            status: 'rejected',
            updatedAt: new Date(),
            rejectedAt: new Date()
          } 
        },
        { session }
      );

      // Step 5: Update loan request status
      await loanRequestsCollection.updateOne(
        { _id: new ObjectId(loanId) },
        { 
          $set: { 
            status: 'accepted',
            acceptedOfferId: new ObjectId(offerId),
            updatedAt: new Date()
          } 
        },
        { session }
      );

      return {
        acceptedOffer: offerId,
        rejectedOffers: rejectResult.modifiedCount
      };
    });

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Offer accepted successfully! All other offers for this loan have been rejected.',
      data: {
        acceptedOfferId: offerId,
        loanId: loanId
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error accepting offer:', error);
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to accept offer'
    });
  } finally {
    await session.endSession();
  }
});

module.exports = router;