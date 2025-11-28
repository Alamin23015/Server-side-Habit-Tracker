const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;


const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://habit-tracker-phi.vercel.app",
    "https://server-three-lake.vercel.app"
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());


let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    serviceAccount = require('./serviceAccountKey.json');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin Initialized Successfully");
} catch (error) {
  console.error("Firebase Admin Init Failed:", error.message);
}


const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing!");

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let habitCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("habitTrackerDB");
    habitCollection = db.collection("habits");
    console.log("MongoDB Connected!");
  } catch (err) {
    console.error("MongoDB Connection Failed:", err);
    process.exit(1);
  }
}
connectDB();


async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; 
    console.log(`Token verified for UID: ${decoded.uid} | Email: ${decoded.email}`);
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
}


function calculateStreak(completionHistory) {
  if (!completionHistory || completionHistory.length === 0) return 0;

  const dates = [...new Set(completionHistory.map(d => new Date(d).toISOString().split('T')[0]))]
    .sort((a, b) => new Date(b) - new Date(a));

  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let expectedDate = new Date(dates[0]);
  for (const date of dates) {
    if (date === expectedDate.toISOString().split('T')[0]) {
      streak++;
      expectedDate.setDate(expectedDate.getDate() - 1);
    } else break;
  }
  return streak;
}


app.get('/', (req, res) => res.send('Habit Tracker Server Running!'));


app.get('/api/habits', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = {};
    if (search) query.title = { $regex: search, $options: 'i' };
    if (category && category !== 'All') query.category = category;

    const habits = await habitCollection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    res.json(habits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load public habits" });
  }
});


app.post('/api/habits', verifyToken, async (req, res) => {
  try {
    const habitData = req.body;
    const newHabit = {
      ...habitData,
      userEmail: req.user.email,
      userName: req.user.name || req.user.email.split('@')[0],
      firebaseUid: req.user.uid,       
      createdAt: new Date(),
      completionHistory: [],
      currentStreak: 0,
    };
    const result = await habitCollection.insertOne(newHabit);
    const inserted = await habitCollection.findOne({ _id: result.insertedId });
    res.status(201).json(inserted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create habit" });
  }
});


app.get('/api/habits/my', verifyToken, async (req, res) => {
  try {
    console.log(`Fetching habits for UID: ${req.user.uid}`);
    const habits = await habitCollection
      .find({ firebaseUid: req.user.uid })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(habits);
  } catch (err) {
    console.error("Error fetching my habits:", err);
    res.status(500).json({ message: "Failed to load your habits" });
  }
});


app.delete('/api/habits/:id', verifyToken, async (req, res) => {
  try {
    const result = await habitCollection.deleteOne({
      _id: new ObjectId(req.params.id),
      firebaseUid: req.user.uid
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Habit not found or unauthorized" });
    }
    res.json({ message: "Habit deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed" });
  }
});


app.patch('/api/habits/:id/complete', verifyToken, async (req, res) => {
  try {
    const habit = await habitCollection.findOne({
      _id: new ObjectId(req.params.id),
      firebaseUid: req.user.uid
    });
    if (!habit) return res.status(404).json({ message: "Habit not found" });

    const today = new Date().toISOString().split('T')[0];
    const already = habit.completionHistory.some(d =>
      new Date(d).toISOString().split('T')[0] === today
    );
    if (already) return res.status(400).json({ message: "Already completed today" });

    const updatedHistory = [...habit.completionHistory, new Date()];
    const newStreak = calculateStreak(updatedHistory);

    await habitCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $push: { completionHistory: new Date() },
        $set: { currentStreak: newStreak }
      }
    );

    const updated = await habitCollection.findOne({ _id: new ObjectId(req.params.id) });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Complete failed" });
  }
});

// Update habit
app.put('/api/habits/:id', verifyToken, async (req, res) => {
  try {
    const updatedData = req.body;
    delete updatedData._id;
    delete updatedData.userEmail;
    delete updatedData.userName;
    delete updatedData.firebaseUid;
    delete updatedData.completionHistory;
    delete updatedData.currentStreak;

    const result = await habitCollection.updateOne(
      { _id: new ObjectId(req.params.id), firebaseUid: req.user.uid },
      { $set: updatedData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Not found or unauthorized" });
    }

    const updatedHabit = await habitCollection.findOne({ _id: new ObjectId(req.params.id) });
    res.json(updatedHabit);
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});