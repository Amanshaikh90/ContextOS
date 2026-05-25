import {Router ,Request,Response} from 'express';
import {createUser, saveToken} from '../services/dbHelper.js';
import axios from 'axios';

const router:Router = Router();
const BASE_URL = process.env.NODE_ENV === 'production' 
    ? 'https://contextos-production.up.railway.app' 
    : 'https://quartered-happening-remedial.ngrok-free.dev';


// Init user 
router.post('/init', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        const user = await createUser(email);
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: "Failed to sync user" });
    }
});

// Save token on postgresql
router.post('/token', async (req, res) => {
    const { userId, provider, accessToken } = req.body;
    try {
        const tokenEntry = await saveToken(userId, provider, accessToken);
        res.json({ success: true, tokenEntry });
    } catch (error) {
        res.status(500).json({ error: "Failed to save token" });
    }
});


// Route 1: Start the login process

router.get('/github',(req:Request,res:Response)=>{
    const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';

    const params = new URLSearchParams({
        client_id:process.env.GITHUB_CLIENT_ID || '',
        redirect_uri:`${BASE_URL}/auth/github/callback`,
        state:req.query.userId as string // should be random in production
    });
    res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
});


// Router 2: The Callback - GitHub sends the user back here
router.get('/github/callback',async(req:Request,res:Response)=>{
    const {code,state:userId} = req.query;

    

    if(!code){
        return res.status(400).send("No code provided from GitHub");
    }

    const finalUserId = (userId as string) || "dev-test-user-001";

    try{

        // Exchange code for Acces Token

        const tokenResponse = await fetch('https://github.com/login/oauth/access_token',{
            method:'POST',
            headers:{
                'Accept':'application/json',
                'Content-Type':'application/json'
            },
            body:JSON.stringify({
                client_id:process.env.GITHUB_CLIENT_ID,
                client_secret:process.env.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: `${BASE_URL}/auth/github/callback`
            })
        });

        const data:any = await tokenResponse.json();

        if(data.error){
            return res.status(400).json(data);
        }

        const accessToken = data.access_token;

        // NOTE: In a real app, you'd get the userId from a session or JWT.
        // For now, we are proving the connection works.
        // await saveToken(some_user_id, 'github', accessToken);

        // GET YOUR USER ID : open pgadmin, copy the uuid hardcode it


        // save to database

        await saveToken(finalUserId as string,'github',accessToken);

        res.send('<h1>GitHub Connected! You can close this.</h1>');

    }catch(error){
        console.error("OAuth Error:" , error);
        res.status(500).send("Authentication failed");
    }

});




// Router 1
router.get('/jira', (req, res) => {
    const clientId = process.env.JIRA_CLIENT_ID;
    const redirectUri = encodeURIComponent(process.env.JIRA_CALLBACK_URL!);
    
    // Scopes must match what you picked in the dashboard
    const scopes = encodeURIComponent('read:jira-work read:jira-user');

    const authUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${req.query.userId}&response_type=code&prompt=consent`;
    
    res.redirect(authUrl);
});


// Router 2
router.get('/jira/callback', async (req, res) => {
    const { code, state } = req.query; // 'state' is the userId we passed above

    if (!code) {
    return res.status(400).json({ error: "No authorization code provided from Jira." });
    }

    try {
        const response = await axios.post('https://auth.atlassian.com/oauth/token', {
            grant_type: 'authorization_code',
            client_id: process.env.JIRA_CLIENT_ID,
            client_secret: process.env.JIRA_CLIENT_SECRET,
            code: code,
            redirect_uri: process.env.JIRA_CALLBACK_URL
        });

        const { access_token } = response.data;

        // Save to your PostgreSQL using your existing helper
        await saveToken(state as string, 'jira', access_token);

        res.send('<h1>Jira Connected Successfully! You can close this window.</h1>');
    } catch (error) {
        console.error('Jira OAuth Error:', error);
        res.status(500).send('Authentication failed');
    }
});




// Router 1
router.get('/slack', (req, res) => {
    const { userId } = req.query; // Pass this from the frontend/VS Code
    
    if (!userId) {
        return res.status(400).send("userId is required");
    }

    const params = new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        user_scope: 'search:read,channels:read,groups:read', // User-level permissions
        redirect_uri: process.env.SLACK_CALLBACK_URL!,
        state: userId as string // Carry the userId through the handshake
    });

    res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

// Router 2
router.get('/slack/callback', async (req, res) => {
    const { code, state: userId, error } = req.query;

    if (error) {
        return res.status(400).send(`Slack Access Denied: ${error}`);
    }

    try {
        // Exchange code for Access Token
        const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
            params: {
                client_id: process.env.SLACK_CLIENT_ID,
                client_secret: process.env.SLACK_CLIENT_SECRET,
                code,
                redirect_uri: process.env.SLACK_CALLBACK_URL
            }
        });

        if (!response.data.ok) {
            throw new Error(response.data.error || "Slack API Error");
        }

        
        const accessToken = response.data.authed_user?.access_token;

        if (!accessToken) {
            throw new Error("No user access token received");
        }

        // Save to PostgreSQL
        await saveToken(userId as string, 'slack', accessToken);

        res.send('<h1>Slack Connected! You can return to VS Code.</h1>');
    } catch (err: any) {
        console.error("Slack OAuth Error:", err.response?.data || err.message);
        res.status(500).send("Failed to complete Slack authentication.");
    }
});


export default router;