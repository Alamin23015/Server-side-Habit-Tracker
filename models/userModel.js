// models/userModel.js
const { ObjectId } = require('mongodb');
const connectDB = require('../utils/db');

const User = {
  async create(userData) {
    const db = await connectDB();
    const result = await db.collection('users').insertOne(userData);
    return { _id: result.insertedId, ...userData };
  },

  async findById(id) {
    const db = await connectDB();
    return await db.collection('users').findOne({ _id: new ObjectId(id) });
  },

  async findByFirebaseUid(firebaseUid) {
    const db = await connectDB();
    return await db.collection('users').findOne({ firebaseUid });
  }
};

module.exports = User;