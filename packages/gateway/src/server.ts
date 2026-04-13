import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import Tool from './models/Tool';

// Load .env from workspace root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/agenthub';

// Basic indexing route logic to test the database
app.get('/api/registry', async (req, res) => {
    try {
        const query = req.query.q as string;
        let tools = [];
        if (query) {
            // Primitive search
            tools = await Tool.find({ 
                $or: [
                    { category: { $regex: query, $options: 'i' } },
                    { toolId: { $regex: query, $options: 'i' } }
                ]
            }).sort({ reputation: -1 });
        } else {
            tools = await Tool.find().sort({ reputation: -1 });
        }
        res.json(tools);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch registry' });
    }
});

app.post('/api/proxy', async (req, res) => {
    // Standard x402 routing placeholder
    const { toolId, args } = req.body;
    res.status(200).json({ status: 'Proxy logic goes here. Need x402 client implementation.' });
});

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB.');
        app.listen(PORT, () => {
            console.log(`Gateway indexing server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });
