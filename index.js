const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

//6humU_Y_D#a!h%a
//SimpleDBUser

//middlewere
app.use(cors());
app.use(express.json())

// const uri = "mongodb+srv://SimpleDBUser:<db_password>@cluster0.c58dg89.mongodb.net/?appName=Cluster0";

const uri = "mongodb+srv://SimpleDBUser:6humU_Y_D%23a%21h%25a@cluster0.c58dg89.mongodb.net/?appName=Cluster0";


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Smart server os rumming')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
