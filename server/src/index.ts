import express from 'express';
import cors from 'cors';
import {createUser, getTokenByUserId, saveToken} from './services/dbHelper.js';
import { timeStamp } from 'node:console';
import authRoutes from './routes/auth.js';
import { fetchGitHubPRs } from './services/github.js';




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

app.get('/context', async (req, res) => {
    const { userId } = req.query; // Now expecting userId from the extension

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    try {
        // 1. Fetch the GitHub token from  DB
        const tokenData = await getTokenByUserId(userId as string, 'github');

        if (!tokenData) {
            return res.status(404).json({ error: "GitHub not connected" });
        }

        // 2. Fetch REAL data from GitHub API
        const realPRs = await fetchGitHubPRs(tokenData.accessToken);

        res.json({
            prs: realPRs,
            tickets: [], // Future Jira integration
            slackThreads: [] // Future Slack integration
        });
    } catch (error) {
        console.error("Context Error:", error);
        res.status(500).json({ error: "Failed to fetch context" });
    }
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