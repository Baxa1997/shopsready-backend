require('dotenv').config();
const express = require('express');
const cors = require('cors'); 
const productRoutes = require('./routes/productRoutes');

const app = express();
const PORT = 5001;

app.use(cors()); 
app.use(express.json()); 

app.use('/api/v1/categories', productRoutes);

app.listen(PORT, () => {
  console.log(`🚀 ShopsReady Backend live on http://localhost:${PORT}`);
});