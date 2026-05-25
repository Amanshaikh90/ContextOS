import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {Redis} from 'ioredis';
import authRoutes from './routes/auth.js';
import contextRoutes from './routes/context.js';
import http from 'http';
import { setupWebSocketServer } from './services/socket.js';


const app = express();
export const redis = new Redis(process.env.REDIS_URL||'redis://redis:6379');

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf; // Store the raw buffer for signature verification
  }
}));
app.use(cors({origin:'*'}));

redis.on('connect',()=>{
    console.log('Connected to Redis Cache');
});

redis.on('error',(err)=>{
    console.log('Redis Error:', err);
});



app.use('/api/auth', authRoutes);       // /auth/init, /auth/token, /auth/jira, etc.
app.use('/api/context', contextRoutes); 
app.use('/api',contextRoutes);

const PORT = process.env.PORT || 5000;

const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on Port ${PORT}`);
});
setupWebSocketServer(server);

