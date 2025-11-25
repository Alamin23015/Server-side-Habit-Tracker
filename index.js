
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173", 
    
  ],
  credentials: true
}));
app.use(express.json());


try {
  const serviceAccount = require('./serviceAccountKey.json'); 
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin Initialized");
} catch (error) {
  console.error("Firebase Admin Init Failed:", error.message);
}


const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let db, habitCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("habitTrackerDB"); 
    habitCollection = db.collection("habits");
    console.log("MongoDB Atlas Connected!");
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}
connectDB().catch(console.dir);


async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(403).send({ message: 'Forbidden: Invalid token' });
  }
}


function calculateStreak(completionHistory) {
  if (!completionHistory || completionHistory.length === 0) return 0;

 
  const sortedDates = [...new Set(completionHistory.map(d => new Date(d).toISOString().split('T')[0]))]
    .sort((a, b) => new Date(b) - new Date(a));

  let streak = 0;
  const today = new Date().toISOString().split('T')[0]; // আজ
  
 
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  
  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
    return 0;
  }

  
  let currentDateToCheck = new Date(sortedDates[0]); 

  for (let i = 0; i < sortedDates.length; i++) {
    const dateStr = sortedDates[i];
    const checkStr = currentDateToCheck.toISOString().split('T')[0];

    if (dateStr === checkStr) {
      streak++;
      
      currentDateToCheck.setDate(currentDateToCheck.getDate() - 1);
    } else {
      break; 
    }
  }
  return streak;
}


app.get('/api/habits', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = {};

   
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
   
    if (category && category !== 'All') {
      query.category = category;
    }

    const habits = await habitCollection
      .find(query)
      .sort({ createdAt: -1 }) 
      .limit(20) 
      .toArray();
      
    res.send(habits);
  } catch (err) {
    res.status(500).send({ message: "Failed to load public habits" });
  }
});


app.post('/api/habits', verifyToken, async (req, res) => {
  try {
    const habitData = req.body;
    const user = req.user; 
    const newHabit = {
      ...habitData,
      userEmail: user.email,
      userName: user.name || user.email.split('@')[0],
      firebaseUid: user.uid,
      createdAt: new Date(),
      completionHistory: [],
      currentStreak: 0,
    };
    const result = await habitCollection.insertOne(newHabit);
    res.status(201).send(result);
  } catch (err) {
    res.status(500).send({ message: "Failed to add habit", error: err.message });
  }
});

// ৩. Get My Habits (Private)
app.get('/api/habits/my', verifyToken, async (req, res) => {
  try {
    const query = { firebaseUid: req.user.uid };
    const habits = await habitCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.send(habits);
  } catch (err) {
    res.status(500).send({ message: "Failed to load habits" });
  }
});


app.delete('/api/habits/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id), firebaseUid: req.user.uid };
    const result = await habitCollection.deleteOne(query);
    if (result.deletedCount === 0) return res.status(404).send({ message: "Habit not found or unauthorized" });
    res.send({ message: "Habit deleted", ...result });
  } catch (err) {
    res.status(500).send({ message: "Failed to delete" });
  }
});

// ৫. Mark Complete (Private - Streak Logic Here)
app.patch('/api/habits/:id/complete', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    
    const query = { _id: new ObjectId(id) }; 

    const habit = await habitCollection.findOne(query);
    if (!habit) return res.status(404).send({ message: "Habit not found" });

    const todayStr = new Date().toISOString().split('T')[0];
    const alreadyDone = habit.completionHistory.some(d => 
      new Date(d).toISOString().split('T')[0] === todayStr
    );

    if (alreadyDone) return res.status(400).send({ message: "Already completed today" });

    const updatedHistory = [...habit.completionHistory, new Date()];
    const newStreak = calculateStreak(updatedHistory);

    await habitCollection.updateOne(query, {
      $push: { completionHistory: new Date() },
      $set: { currentStreak: newStreak }
    });

    const updatedHabit = await habitCollection.findOne(query);
    res.send(updatedHabit);
  } catch (err) {
    res.status(500).send({ message: "Failed to mark complete", error: err.message });
  }
});


app.put('/api/habits/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    const query = { _id: new ObjectId(id), firebaseUid: req.user.uid };
    
    
    delete updatedData._id;
    delete updatedData.userEmail;
    delete updatedData.userName;
    delete updatedData.firebaseUid;
    delete updatedData.completionHistory;
    delete updatedData.currentStreak;

    const result = await habitCollection.updateOne(query, { $set: updatedData });
    if (result.matchedCount === 0) return res.status(404).send({ message: "Habit not found or unauthorized" });
    
    const updatedHabit = await habitCollection.findOne(query);
    res.send(updatedHabit);
  } catch (err) {
    res.status(500).send({ message: "Failed to update habit", error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Habit Tracker Server Running!');
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});