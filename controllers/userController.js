// controllers/userController.js
const admin = require('../config/firebase');
const User = require('../models/userModel');

const registerUser = async (req, res) => {
  try {
    const { firebaseToken } = req.body;

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const { uid, email, name } = decodedToken;

    // Check if user exists
    let user = await User.findByFirebaseUid(uid);
    if (!user) {
      user = await User.create({
        firebaseUid: uid,
        email,
        name,
        createdAt: new Date()
      });
    }

    res.status(200).json({
      success: true,
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { registerUser };