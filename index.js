const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
require("dotenv").config();
const connectDB = require("./DBconnection.js");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ADDED: import the loans route
const loanRoutes = require("./routes/loanRoutes");

// Start server only after DB connection
connectDB().then((db) => {
  // ✅ collections here
  const userCollection = db.collection("users");
  const fundraiseCollection = db.collection("fundraise");

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

  //make normal user to admin (duplicate but kept as-is)
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

  //fundraise form api
  app.post("/fundraise", async (req, res) => {
    try {
      const fund = req.body; // get form data from client
      console.log(fund);

      // check if the same email already applied
      const query = { email: fund.email };
      const existingFund = await fundraiseCollection.findOne(query);

      if (existingFund) {
        return res.send({
          message: "Application already exists",
          insertedId: null,
        });
      }

      // insert the fundraise application
      const result = await fundraiseCollection.insertOne(fund);
      res.send(result);
    } catch (error) {
      console.error("Error inserting fundraise application:", error);
      res.status(500).send({ message: "Something went wrong" });
    }
  });

  // ✅ new GET route for fundraise applicants
  app.get("/fundraise", async (req, res) => {
    try {
      const funds = await fundraiseCollection.find().toArray();
      res.send(funds);
    } catch (error) {
      console.error("Error fetching fundraise applicants:", error);
      res.status(500).send({ message: "Something went wrong" });
    }
  });

  //basic route
  app.get("/", (req, res) => {
    res.send("Hello from Peer fund Server!");
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on port: ${port}`);
  });
});
