import {Router ,Request,Response} from 'express';
import {saveToken} from '../services/dbHelper.js';

const router:Router = Router();




// Route 1: Start the login process

router.get('/github',(req:Request,res:Response)=>{
    const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';

    const params = new URLSearchParams({
        client_id:process.env.GITHUB_CLIENT_ID || '',
        redirect_uri:'http://localhost:3001/auth/github/callback',
        scope:'repo read:user', //Permissions we need
        state:'random_secure_string' // should be random in production
    });
    res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
});


// Router 2: The Callback - GitHub sends the user back here
router.get('/github/callback',async(req:Request,res:Response)=>{
    const {code} = req.query;

    if(!code){
        return res.status(400).send("No code provided from GitHub");
    }

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
                code
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

        const TEMP_USER_ID = "50829cb9-d010-44ae-862a-166f6e54094a";

        // save to database

        await saveToken(TEMP_USER_ID,'github',accessToken);

        res.send(`
            <h1>✅ Token Saved!</h1>
            <p>Check pgAdmin 'OAuthToken' table to see it.</p>
        `);

    }catch(error){
        console.error("OAuth Error:" , error);
        res.status(500).send("Authentication failed");
    }

});


export default router;