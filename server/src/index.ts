import express from 'express';
import cors from 'cors';
import {createUser, saveToken} from './services/dbHelper.js';
import { timeStamp } from 'node:console';
import authRoutes from './routes/auth.js';




const app = express();
app.use(express.json());
app.use(cors());


app.get('/health',(req,res)=>{
    res.json({status:'ok',timeStamp:Date.now()});

});




app.post('/auth/init',async(req,res)=>{
    const {email} = req.body;

    if(!email){
        return res.status(400).json({error:"Email is required"});
    }

    try{
        const user = await createUser(email);
        res.json({success:true,user});
    }catch(error){
        console.error("Database Error:",error);
        res.status(500).json({error:"Failed to sync user to database"});
    }
});

app.get('/context',async(req,res)=>{
    const {file} = req.query;


    res.json({
        file,
        tickets: [{ id: 'AUTH-124', title: 'Fix token refresh', status: 'In Progress' }],
        prs: [{ number: 89, title: 'Fix OAuth flow', author: 'alice' }],
        slackThreads: [{ channel: 'engineering', preview: 'Discussed the refresh token issue...' }]
    });
});


app.post('/auth/token',async(req,res)=>{
    const {userId,provider,accessToken}=req.body;

    try{
        const tokenEntry = await saveToken(userId,provider,accessToken);
        res.json({success:true,tokenEntry});
    }catch(error){
        console.log(error);
        res.status(500).json({error:"Failed to save tokn"});
    }
});

app.use('/auth',authRoutes);


app.listen(3001,()=>{
    console.log("Server running on Port 3001");
});