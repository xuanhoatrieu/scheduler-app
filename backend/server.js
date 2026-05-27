const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Basic Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to TUAF Schedule Backend API Services',
    status: 'Running',
    version: '1.0.0'
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
