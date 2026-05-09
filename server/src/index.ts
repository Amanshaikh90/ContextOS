import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import contextRoutes from './routes/context.js';

const app = express();

app.use(express.json());
app.use(cors());


app.use('/auth', authRoutes);       // /auth/init, /auth/token, /auth/jira, etc.
app.use('/context', contextRoutes); 

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on Port ${PORT}`);
});