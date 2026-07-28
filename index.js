const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
require("dotenv").config();
const connectDB = require("./DBconnection.js");

// Initialize Firebase Admin SDK
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin initialized with Service Account");
  } else {
    admin.initializeApp({
      projectId: process.env.VITE_projectId || "uiu-loan-and-crowdfunding"
    });
    console.log("✅ Firebase Admin initialized with Project ID");
  }
} catch (error) {
  console.log("Firebase Admin init message:", error.message);
}

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Configure Multer for file uploads
const uploadsDir = path.join(__dirname, "public", "uploads", "profile-images");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "profile-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

// Import routes
const loanRoutes = require("./routes/loanRoutes");
const offerRoutes = require("./routes/offerRoutes");
const comparisonRoutes = require("./routes/loanComparison");

// Start server only after DB connection
connectDB().then((db) => {
  app.locals.db = db;
  app.locals.mongoClient = db.client;

  // Mount modular routes
  app.use("/api/loans", loanRoutes);
  app.use("/api/offers", offerRoutes);
  app.use("/api/comparison", comparisonRoutes);

  // Collections
  const userCollection = db.collection("users");
  const fundraiseCollection = db.collection("fundraise");
  const userExtraInfoCollection = db.collection("userExtraInfo");
  const loanRequestsCollection = db.collection("loanrequests");

  // JWT endpoint
  app.post("/jwt", async (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "1h",
    });
    res.send({ token });
  });

  // Middleware for verifying JWT token
  const verifyToken = (req, res, next) => {
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

  // Middleware for verifying admin
  const verifyAdmin = async (req, res, next) => {
    const email = req.decoded.email;
    const query = { email: email };
    const user = await userCollection.findOne(query);
    const isAdmin = user?.role === "admin";
    if (!isAdmin) {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };

  // Get user by email
  app.get("/users/:email", verifyToken, async (req, res) => {
    const email = req.params.email;
    if (email !== req.decoded.email) {
      return res.status(403).send({ message: "unauthorized access" });
    }
    const query = { email: email };
    const user = await userCollection.findOne(query);
    res.send(user);
  });

  // Add user data to db
  app.post("/users", async (req, res) => {
    const user = req.body;
    const query = { email: user.email };
    const existingUser = await userCollection.findOne(query);
    if (existingUser) {
      return res.send({ message: "User already exists", insertedId: null });
    }
    const result = await userCollection.insertOne(user);
    res.send(result);
  });

  // Check if user is admin
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

  // Make user to admin
  app.patch("/users/admin/:id", verifyToken, async (req, res) => {
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

  // Get all users (Admin verify optional or verifyToken)
  app.get("/users", verifyToken, async (req, res) => {
    const result = await userCollection.find().toArray();
    res.send(result);
  });

  // Delete user endpoint: Deletes from MongoDB AND Firebase Auth
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

      let firebaseDeleted = false;
      let firebaseError = null;

      // 1. Delete from Firebase Auth by UID or Email
      try {
        if (user.uid) {
          await admin.auth().deleteUser(user.uid);
          firebaseDeleted = true;
          console.log(`✅ Deleted Firebase user with UID: ${user.uid}`);
        } else if (user.email) {
          const fbUser = await admin.auth().getUserByEmail(user.email);
          if (fbUser && fbUser.uid) {
            await admin.auth().deleteUser(fbUser.uid);
            firebaseDeleted = true;
            console.log(`✅ Deleted Firebase user with Email: ${user.email}`);
          }
        }
      } catch (fbErr) {
        console.error("Firebase Auth deletion error note:", fbErr?.message || fbErr);
        firebaseError = fbErr?.message;
      }

      // 2. Delete from MongoDB userCollection
      const result = await userCollection.deleteOne(query);

      // 3. Cleanup userExtraInfo
      try {
        if (user.uid) {
          await userExtraInfoCollection.deleteOne({ userId: user.uid });
        }
      } catch (e) {
        console.log("Cleanup note:", e.message);
      }

      res.send({
        success: true,
        result,
        firebaseDeleted,
        firebaseError,
        message: firebaseDeleted 
          ? "User deleted successfully from MongoDB and Firebase Auth" 
          : "User deleted from MongoDB"
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res
        .status(500)
        .send({ success: false, message: "Failed to delete user" });
    }
  });

  // ==========================
  // Loan Requests APIs (For Admin & Borrowers)
  // ==========================

  app.get("/loanRequest", async (req, res) => {
    try {
      const loans = await loanRequestsCollection.find().toArray();
      res.send(loans);
    } catch (error) {
      console.error("Error fetching loan requests:", error);
      res.status(500).send({ message: "Failed to fetch loan requests" });
    }
  });

  app.patch("/loanRequest/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status || "Approved" } };
      const result = await loanRequestsCollection.updateOne(filter, updateDoc);
      res.send(result);
    } catch (error) {
      console.error("Error updating loan request:", error);
      res.status(500).send({ message: "Failed to update loan request status" });
    }
  });

  // ==========================
  // Fundraise APIs (For Admin & Applicants)
  // ==========================

  app.post("/fundraise", async (req, res) => {
    try {
      const fund = req.body;
      const query = { email: fund.email };
      const existingFund = await fundraiseCollection.findOne(query);

      if (existingFund) {
        return res.send({
          message: "Application already exists",
          insertedId: null,
        });
      }

      const result = await fundraiseCollection.insertOne(fund);
      res.send(result);
    } catch (error) {
      console.error("Error inserting fundraise application:", error);
      res.status(500).send({ message: "Something went wrong" });
    }
  });

  app.get("/fundraise", async (req, res) => {
    try {
      const funds = await fundraiseCollection.find().toArray();
      res.send(funds);
    } catch (error) {
      console.error("Error fetching fundraise applicants:", error);
      res.status(500).send({ message: "Something went wrong" });
    }
  });

  app.patch("/fundraise/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status || "Approved" } };
      const result = await fundraiseCollection.updateOne(filter, updateDoc);
      res.send(result);
    } catch (error) {
      console.error("Error updating fundraise status:", error);
      res.status(500).send({ message: "Failed to update fundraise status" });
    }
  });

  // User Extra Info APIs
  app.get("/userExtraInfo/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const info = await userExtraInfoCollection.findOne({ userId: id });
      res.send(info || {});
    } catch (error) {
      console.error("Error fetching user extra info:", error);
      res.status(500).send({ error: "Failed to fetch user extra info" });
    }
  });

  app.post("/userExtraInfo/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const data = req.body;
      const filter = { userId: id };
      const updateDoc = { $set: data };

      const result = await userExtraInfoCollection.updateOne(filter, updateDoc, {
        upsert: true,
      });

      res.send({ success: true, result });
    } catch (error) {
      console.error("Error saving user extra info:", error);
      res.status(500).send({ error: "Failed to save user extra info" });
    }
  });

  // Profile Image Upload APIs
  app.post(
    "/upload-profile-image",
    verifyToken,
    upload.single("image"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).send({ error: "No image file provided" });
        }

        if (!req.decoded.email) {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(401).send({ error: "Unauthorized" });
        }

        const imageUrl = `${req.protocol}://${req.get(
          "host"
        )}/uploads/profile-images/${req.file.filename}`;

        res.send({
          success: true,
          imageUrl: imageUrl,
          message: "Image uploaded successfully",
        });
      } catch (error) {
        console.error("Error uploading image:", error);
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).send({ error: "Failed to upload image" });
      }
    }
  );

  app.patch("/users/:email", verifyToken, async (req, res) => {
    try {
      const email = req.params.email;
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
        message: "Profile updated successfully",
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).send({ error: "Failed to update user profile" });
    }
  });

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
      console.error("Error fetching user image:", error);
      res.status(500).send({ error: "Failed to fetch user image" });
    }
  });

  // Basic Route
  app.get("/", (req, res) => {
    res.send("Hello from Peer fund Server!");
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on port: ${port}`);
  });
});
