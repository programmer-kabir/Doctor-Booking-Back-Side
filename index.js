const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// Middle ware
app.use(cors());
app.use(express.json());

const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized token" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized token" });
    }
    req.decoded = decoded;
    next();
  });
};
// console.log(process.env.DB_USER);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0i3pjbq.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("Bokking").collection("users");
    const servicesCollection = client.db("Bokking").collection("services");
    const selectedCollection = client.db("Bokking").collection("selected");

    // jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send(token);
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };
    // User
    app.post("/users", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Admin verify
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Service Releted Apis
    app.get("/services", async (req, res) => {
      const result = await servicesCollection.find().toArray();
      res.send(result);
    });

    // Selected service
    // app.post('/selected', async(req, res) =>{
    // const data = req.body;
    // const query = { email: data.email }
    // if (existingData) {
    //   return res.send({ message: "user already exist" });
    // }
    // const result = await servicesCollection.insertOne(data)
    // console.log(result);
    // })
    // app.post("/selected", async (req, res) => {
    //   const data = req.body;
    //   const query = { email: data.email };
    //   const existingData = await servicesCollection.findOne(query);
    //   if (existingData) {
    //     // Update the quantity
    //     const updatedQuantity = existingData.quantity + data.quantity;
    //     const updateResult = await servicesCollection.updateOne(query, {
    //       $set: { quantity: updatedQuantity },
    //     });
    //   }

    //   const insertResult = await servicesCollection.insertOne(data);
    //   res.send(insertResult);
    // });

    app.post("/selected", async (req, res) => {
      const data = req.body;
      const query = { email: data.email, serviceName: data.serviceName }; // Add serviceName to the query
    
      const existingData = await selectedCollection.findOne(query);
      if (existingData) {
        // Update the quantity
        const updatedQuantity = existingData.quantity + data.quantity;
        const updateResult = await selectedCollection.updateOne(query, {
          $set: { quantity: updatedQuantity },
        });
        res.send(updateResult);
      } else {
        const insertResult = await selectedCollection.insertOne(data);
        res.send(insertResult);
        
      }
    });
    


    app.get("/selected", async (req, res) => {
      const email = req.query.email;
      if(!email){
        res.send([])
      }
      const query = { email: email };
      const result = await selectedCollection.find(query).toArray();
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Sever is running");
});
app.listen(port);
