const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const connectDB = require("./DBconnection.js");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profile-images/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Start server only after DB connection
connectDB().then((client) => {
  // keep the collections here
  const userCollection = client.db("peerFund").collection("users");

  // Collection for storing extra user info
  const userExtraInfoCollection = client.db("peerFund").collection("userExtraInfo");

  //jwt releted work
  app.post("/jwt", async (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "1h",
    });
    res.send({ token });
  });

  //midleware for verify jwt token
  const verifyToken = (req, res, next) => {
    console.log("inside verify token", req.headers);
    if (!req.headers.authorization) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    const token = req.headers.authorization.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      req.decoded = decoded;
      next();
    });
  };

  // verify admin middleware
  const verifyAdmin = async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email };
    const user = await userCollection.findOne(query);
    console.log("user from db in verifyAdmin", user);
    const isAdmin = user?.role === "admin";
    console.log("isAdmin in verifyAdmin", isAdmin);
    if (!isAdmin) {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };

  //get user by email
  app.get("/users/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: "unauthorized access" });
    }
    const query = { email: email };
    const user = await userCollection.findOne(query);
    res.send(user);
  });

  //user releated apis

  //add user data to db
  app.post("/users", async (req, res) => {
    const user = req.body;
    console.log(user);
    const query = { email: user.email }; //check if user already exists
    const existingUser = await userCollection.findOne(query);
    if (existingUser) {
      return res.send({ message: "User already exists", insertedId: null });
    }
    const result = await userCollection.insertOne(user);
    res.send(result);
  });

  //check if user is admin or not
  app.get("/users/admin/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: "unauthorized access" });
    }
    const query = { email: email };
    const user = await userCollection.findOne(query);
    let admin = false;
    if (user) {
      admin = user?.role === "admin";
    }
    res.send({ admin });
  });

  //make normal user to admin
  app.patch("/users/admin/:id", async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        role: "admin",
      },
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
  });

  //get all users
  app.get("/users", verifyToken, async (req, res) => {
    const result = await userCollection.find().toArray();
    res.send(result);
  });

  app.delete("/users/:id", verifyToken, async (req, res) => {
    const id = req.params.id;
    try {
      const query = { _id: new ObjectId(id) };
      const user = await userCollection.findOne(query);
      if (!user) {
        return res
          .status(404)
          .send({ success: false, message: "User not found" });
      }
      // Delete from MongoDB
      const result = await userCollection.deleteOne(query);
      res.send(result);
    } catch (error) {
      console.error("Error deleting user:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to delete user" });
    }
  });

  // ==========================
  // User Extra Info APIs
  // ==========================

  // Get extra info by userId
  app.get("/userExtraInfo/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const info = await userExtraInfoCollection.findOne({ userId: id });
      res.send(info || {}); // send {} if no info found
    } catch (error) {
      console.error("Error fetching user extra info:", error);
      res.status(500).send({ error: "Failed to fetch user extra info" });
    }
  });

  // Add or update extra info
  app.post("/userExtraInfo/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const data = req.body;

      const filter = { userId: id };
      const updateDoc = { $set: data };

      const result = await userExtraInfoCollection.updateOne(
        filter,
        updateDoc,
        { upsert: true } // create new if doesn't exist
      );

      res.send({ success: true, result });
    } catch (error) {
      console.error("Error saving user extra info:", error);
      res.status(500).send({ error: "Failed to save user extra info" });
    }
  });

  // ==========================
  // Profile Image Upload APIs
  // ==========================

  // Upload profile image
  app.post("/upload-profile-image", verifyToken, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send({ error: 'No image file provided' });
      }

      // Verify the user is uploading their own image
      if (!req.decoded.email) {
        // Clean up the uploaded file if authentication fails
        fs.unlinkSync(req.file.path);
        return res.status(401).send({ error: 'Unauthorized' });
      }

      // Construct the image URL
      const imageUrl = `${req.protocol}://${req.get('host')}/uploads/profile-images/${req.file.filename}`;

      res.send({
        success: true,
        imageUrl: imageUrl,
        message: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      // Clean up the uploaded file on error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).send({ error: 'Failed to upload image' });
    }
  });

  // Update user profile (including image)
  app.patch("/users/:email", verifyToken, async (req, res) => {
    try {
      const email = req.params.email;

      // Verify the user is updating their own profile
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }

      const updateData = req.body;
      const filter = { email: email };
      const updateDoc = { $set: updateData };

      const result = await userCollection.updateOne(filter, updateDoc);

      res.send({
        success: true,
        result,
        message: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).send({ error: 'Failed to update user profile' });
    }
  });

  // Get user's profile image
  app.get("/user-image/:email", verifyToken, async (req, res) => {
    try {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);

      res.send({ imageUrl: user?.image || null });
    } catch (error) {
      console.error('Error fetching user image:', error);
      res.status(500).send({ error: 'Failed to fetch user image' });
    }
  });

  // Delete profile image
  app.delete("/user-image/:email", verifyToken, async (req, res) => {
    try {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }

      const filter = { email: email };
      const updateDoc = { $set: { image: "" } };

      const result = await userCollection.updateOne(filter, updateDoc);

      res.send({
        success: true,
        result,
        message: 'Profile image removed successfully'
      });
    } catch (error) {
      console.error('Error removing profile image:', error);
      res.status(500).send({ error: 'Failed to remove profile image' });
    }
  });

  //basic route
  app.get("/", (req, res) => {
    res.send("Hello from Peer fund Server!");
  });

  // Error handling middleware for multer
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send({ error: 'File size too large. Maximum 5MB allowed.' });
      }
    }
    res.status(500).send({ error: error.message });
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on port: ${port}`);
    console.log(`📁 Upload directory: ${path.join(process.cwd(), 'uploads/profile-images')}`);
  });
});