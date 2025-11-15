// utils/db.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
let client;
let db;

const connectDB = async () => {
  if (db) return db;
  
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  console.log('MongoDB Connected');
  return db;
};

module.exports = connectDB;