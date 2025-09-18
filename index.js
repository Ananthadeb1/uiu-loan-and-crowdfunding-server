const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
require("dotenv").config();
const connectDB = require("./DBConnection");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Start server only after DB connection
connectDB().then((client) => {
  // keep the collections here
  const userCollection = client.db("peerFund").collection("users");

  //basic route
  app.get("/", (req, res) => {
    res.send("Hello from Agri Linker Server!");
  });

  app.listen(port, () => {
    console.log(`🚀 Server is running on port: ${port}`);
  });
});
