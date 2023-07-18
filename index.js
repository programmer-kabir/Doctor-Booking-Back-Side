const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const SSLCommerzPayment = require("sslcommerz-lts");
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
const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false;

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const usersCollection = client.db("Bokking").collection("users");
    const servicesCollection = client.db("Bokking").collection("services");
    const selectedCollection = client.db("Bokking").collection("selected");
    const PaymentCollection = client.db("Bokking").collection("payment");
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
    // User api
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
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await selectedCollection.find(query).toArray();
      res.send(result);
    });

    // PAYMENT GETAWAYS
    const tran_id = new ObjectId().toString()
    app.post("/payment", async (req, res) => {
      const body = req.body;
      // console.log(body);
      const service = await servicesCollection.findOne({
        _id: new ObjectId(body.serviceId),
      });
      
      const data = {
        total_amount: service?.price,
        currency: body?.currency,
        tran_id: tran_id, 
        success_url: `http://localhost:5000/payment/success/${tran_id}`,
        fail_url: `http://localhost:5000/payment/fail/${tran_id}`,
        cancel_url: "http://localhost:3030/cancel",
        ipn_url: "http://localhost:3030/ipn",
        shipping_method: "Courier",
        product_name: "Computer.",
        product_category: "Electronic",
        product_profile: "general",
        cus_name: body?.name,
        cus_email: body?.email,
        cus_add1: body?.address,
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: body?.code,
        cus_country: "Bangladesh",
        cus_phone: body?.number,
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };
      console.log(body);
      // console.log(data);
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
      sslcz.init(data).then(apiResponse => {
          // Redirect the user to payment gateway
          let GatewayPageURL = apiResponse.GatewayPageURL
          res.send({url:GatewayPageURL})
          // console.log('Redirecting to: ', GatewayPageURL)
      });

      const finalOrder = {
        service,
        paidStatus: false,
        transitionID: tran_id,
      };
      const result = PaymentCollection.insertOne(finalOrder);
      app.post("/payment/success/:tranId", async (req, res) => {
        console.log(req.params.tranId);
        const result = await PaymentCollection.updateOne(
          { transitionID: req.params.tranId },
          {
            $set: {
              paidStatus: true,
            },
          }
        );

        
        if (result.modifiedCount > 0) {
          const result1 = await servicesCollection.updateOne(
            {serviceId: service.serviceId},
            {
              $inc: {
                availableSlots: -1,
              },
            }
          );
          // console.log(result1);
          res.redirect(
            `http://localhost:5173/dashboard/payment/success/${req.params.tranId}`
          );
        }
      });

      app.post("/payment/fail/:tranId", async (req, res) => {
        const result = await PaymentCollection.deleteOne({
          transitionID: req.params.tranId,
        });
        if (result.deletedCount) {
          res.redirect(
            `http://localhost:5173/dashboard/payment/fail/${req.params.tranId}`
          );
        }
      });

    })

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
