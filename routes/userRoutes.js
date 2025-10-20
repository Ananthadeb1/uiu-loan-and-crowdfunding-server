const express = require("express");
const multer = require("multer");
const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store file in memory
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Update user profile (for image and basic info)
router.patch("/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const updates = req.body;

        if (email !== req.decoded.email) {
            return res.status(403).send({ message: "unauthorized access" });
        }

        const userCollection = req.app.locals.db.collection("users");
        const result = await userCollection.updateOne(
            { email },
            { $set: { ...updates, updatedAt: new Date() } }
        );

        res.json({
            success: true,
            message: "Profile updated successfully",
            result
        });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ success: false, message: "Failed to update profile" });
    }
});

// Profile image upload endpoint - ACTUAL FILE UPLOAD
router.post("/upload-profile-image", upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file provided"
            });
        }

        const { userId, email } = req.body;

        console.log("Image upload request received for:", email);
        console.log("Uploaded file:", req.file.originalname, req.file.size, req.file.mimetype);

        const userCollection = req.app.locals.db.collection("users");

        // Convert the image buffer to base64 for storage
        const imageBuffer = req.file.buffer;
        const base64Image = imageBuffer.toString('base64');
        const imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;

        console.log("Storing image as base64 in database");

        // Update user in database with actual image
        const result = await userCollection.updateOne(
            { email },
            { $set: { image: imageUrl, updatedAt: new Date() } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found or no changes made"
            });
        }

        res.json({
            success: true,
            imageUrl,
            message: "Profile image updated successfully with actual image!"
        });

    } catch (error) {
        console.error("Error uploading image:", error);
        res.status(500).json({
            success: false,
            message: "Image upload failed",
            error: error.message
        });
    }
});

module.exports = router;