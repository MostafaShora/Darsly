
import 'dotenv/config';

import express from 'express';
import mongoose from 'mongoose';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

app.get('/api/health', (_req, res) => {
    res.status(200).json({
        success: true,
        message: 'Darsly API is running',
    });
});

async function startServer(): Promise<void> {
    try {
        const mongoUri = process.env.MONGODB_URI;

        if (!mongoUri) {
            throw new Error('MONGODB_URI is missing from .env');
        }

        await mongoose.connect(mongoUri);

        console.log('MongoDB connected successfully');

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

void startServer();
