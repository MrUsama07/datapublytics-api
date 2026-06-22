require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes    = require('./routes/auth');
const trackRoutes   = require('./routes/track');
const sitesRoutes   = require('./routes/sites');
const statsRoutes   = require('./routes/stats');
const paymentRoutes = require('./routes/payment');
const adminRoutes   = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve frontend static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Tracker script endpoint
app.use('/tracker', express.static(path.join(__dirname, 'public', 'tracker')));

// ✅ API Routes
app.use('/api/track',   trackRoutes);
app.use('/api/auth',    authRoutes);
app.use('/api/sites',   sitesRoutes);
app.use('/api/stats',   statsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin',   adminRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'DataPublytics API is running', time: new Date() }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ DataPublytics backend running on port ${PORT}`));
