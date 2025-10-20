const express = require("express");
const router = express.Router();

// Get user extra info
router.get("/userExtraInfo/:uid", async (req, res) => {
    try {
        const { uid } = req.params;
        const userExtraInfoCollection = req.app.locals.db.collection("userExtraInfo");
        const extraInfo = await userExtraInfoCollection.findOne({ uid });

        res.json(extraInfo || {});
    } catch (error) {
        console.error("Error fetching user extra info:", error);
        res.status(500).json({ message: "Failed to fetch user info" });
    }
});

// Create or update user extra info
router.post("/userExtraInfo/:uid", async (req, res) => {
    try {
        const { uid } = req.params;
        const { birthday, gender, address } = req.body;

        const userExtraInfoCollection = req.app.locals.db.collection("userExtraInfo");

        const result = await userExtraInfoCollection.updateOne(
            { uid },
            {
                $set: {
                    uid,
                    birthday,
                    gender,
                    address,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        res.json({
            success: true,
            message: "Information updated successfully",
            result
        });
    } catch (error) {
        console.error("Error updating user extra info:", error);
        res.status(500).json({ success: false, message: "Failed to update information" });
    }
});

module.exports = router;