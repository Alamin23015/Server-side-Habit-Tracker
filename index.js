require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://habit-tracker-phi.vercel.app",
        "https://server-three-lake.vercel.app"
    ],
    credentials: true
}));
app.use(express.json());

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is missing!");

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true
    }
});

const db = client.db("habitTrackerDB");
const habitCollection = db.collection("habits");

async function connectDB() {
    try {
        await client.connect();
        console.log("MongoDB Connected!");
        return true;
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
        return false;
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

app.get('/', (req, res) => {
    res.send('Habit Tracker Server Running!');
});

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

app.post('/api/habits', async (req, res) => {
    try {
        const habitData = req.body;
        const email = habitData.userEmail;
        if (!email) return res.status(400).json({ message: "userEmail is required" });

        const newHabit = {
            ...habitData,
            habitTitle: habitData.habitTitle,
            userEmail: email,
            userName: habitData.userName || email.split('@')[0],
            createdAt: new Date(),
            completionHistory: [],
            currentStreak: 0
        };

        const result = await habitCollection.insertOne(newHabit);
        const inserted = await habitCollection.findOne({ _id: result.insertedId });
        res.status(201).json(inserted);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to create habit" });
    }
});

app.get('/api/habits/my', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.status(400).json({ message: "email query parameter is required" });

        const habits = await habitCollection
            .find({ userEmail: email })
            .sort({ createdAt: -1 })
            .toArray();
        res.json(habits);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to load your habits" });
    }
});

app.delete('/api/habits/:id', async (req, res) => {
    try {
        const email = req.query.email;
        if (!email) return res.status(400).json({ message: "email is required" });
        if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid ID" });

        const result = await habitCollection.deleteOne({
            _id: new ObjectId(req.params.id),
            userEmail: email
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Habit not found or unauthorized" });
        }
        res.json({ message: "Habit deleted" });
    } catch (err) {
        res.status(500).json({ message: "Delete failed" });
    }
});

app.patch('/api/habits/:id/complete', async (req, res) => {
    try {
        const email = req.body.userEmail;
        if (!email) return res.status(400).json({ message: "userEmail is required" });
        if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid ID" });

        const habit = await habitCollection.findOne({
            _id: new ObjectId(req.params.id),
            userEmail: email
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


app.patch('/api/habits/:id', async (req, res) => {
    try {
        
        const email = req.query.email || req.body.userEmail;
        
        if (!email) return res.status(400).json({ message: "userEmail is required" });
        if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid ID" });

        const updatedData = { ...req.body };
        
        
        delete updatedData._id;
        delete updatedData.userEmail;
        delete updatedData.userName;
        delete updatedData.completionHistory;
        delete updatedData.currentStreak;

      
        const result = await habitCollection.updateOne(
            { _id: new ObjectId(req.params.id), userEmail: email },
            { $set: updatedData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Habit not found or unauthorized" });
        }

        const updatedHabit = await habitCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.json(updatedHabit);
    } catch (err) {
        console.error("Update Error:", err);
        res.status(500).json({ message: "Update failed" });
    }
});

async function startServer() {
    const connected = await connectDB();
    if (connected) {
        if (process.env.NODE_ENV !== 'production') {
            app.listen(port, () => {
                console.log(`Server running on http://localhost:${port}`);
            });
        }
    } else {
        console.error("Failed to start server due to DB connection issue.");
    }
}

startServer();

module.exports = app;