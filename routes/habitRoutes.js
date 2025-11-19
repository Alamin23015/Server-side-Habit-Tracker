// routes/habitRoutes.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// GET: All habits (public + filter by email)
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    const query = email ? { creatorEmail: email } : {};
    const habits = await req.app.locals.db.collection('habits').find(query).sort({ createdAt: -1 }).toArray();
    res.json(habits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET: Single habit
router.get('/:id', async (req, res) => {
  try {
    const habit = await req.app.locals.db.collection('habits').findOne({ _id: new ObjectId(req.params.id) });
    if (!habit) return res.status(404).json({ error: 'Habit not found' });
    res.json(habit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Add habit
router.post('/', async (req, res) => {
  try {
    const habit = { ...req.body, createdAt: new Date() };
    const result = await req.app.locals.db.collection('habits').insertOne(habit);
    res.status(201).json({ _id: result.insertedId, ...habit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH: Update habit
router.patch('/:id', async (req, res) => {
  try {
    const result = await req.app.locals.db.collection('habits').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json({ modifiedCount: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Delete habit
router.delete('/:id', async (req, res) => {
  try {
    const result = await req.app.locals.db.collection('habits').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH: Mark Complete (Add date to history)
router.patch('/:id/complete', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const habit = await req.app.locals.db.collection('habits').findOne({ _id: new ObjectId(req.params.id) });

    if (habit.completionHistory?.includes(today)) {
      return res.json({ message: 'Already completed today' });
    }

    const result = await req.app.locals.db.collection('habits').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $push: { completionHistory: today } }
    );

    res.json({ modified: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;