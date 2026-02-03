require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');


const productRoutes = require('./routes/productRoutes');

const app = express();

const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/categories', productRoutes);

app.get('/', (req, res) => {
  res.send('🚀 ShopsReady API is RUNNING! (Routes loaded)');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});