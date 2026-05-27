import { Router, Request, Response } from 'express';
import { createUser, saveToken, getTokenByUserId } from '../services/dbHelper.js';
import axios from 'axios';

const router: Router = Router();
const BASE_URL = process.env.NODE_ENV === 'production' 
    ? 'https://contextos-production.up.railway.app/api' 
    : 'https://quartered-happening-remedial.ngrok-free.dev/api';


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
// Route 1: Start the login process with an installation-first check
// Route 1: Start the login process with a self-healing installation check
router.get('/github', async (req: Request, res: Response) => {
    const targetUserId = req.query.userId as string;

    if (!targetUserId) {
        console.warn("⚠️ Warning: /auth/github called without a userId parameter.");
    }

    try {
        // 1. Check if a token exists in your DB
        const record = await getTokenByUserId(targetUserId, 'github');

        if (record && record.accessToken) {
            // 2. Validate the token with GitHub to make sure the user didn't revoke it!
            try {
                const checkResponse = await fetch('https://api.github.com/user', {
                    headers: {
                        'Authorization': `token ${record.accessToken}`,
                        'Accept': 'application/json'
                    }
                });

                if (checkResponse.status === 401) {
                    // 🚨 Token is dead (revoked on GitHub)! Force deletion from DB so they act as a new user.
                    console.log(`Token for user ${targetUserId} was revoked on GitHub. Cleaning up database.`);
                    
                    // Call your DB helper here to clear/delete the token row
                    // e.g., await deleteTokenByUserId(targetUserId, 'github'); 
                } else {
                    // 🌟 Token is active and healthy! Skip installation and go straight to normal OAuth.
                    const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
                    const params = new URLSearchParams({
                        client_id: process.env.GITHUB_CLIENT_ID || '',
                        redirect_uri: `${BASE_URL}/auth/github/callback`,
                        state: targetUserId || 'dev-test-user-001' 
                    });
                    return res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
                }
            } catch (apiErr) {
                console.error("Failed to verify token with GitHub:", apiErr);
            }
        }

        // 🚨 NEW USER OR REVOKED USER: Route them to the App Installation drawer first!
        const githubAppInstallUrl = `https://github.com/apps/ContextOS-Beta/installations/new?state=${targetUserId || 'dev-test-user-001'}`;
        return res.redirect(githubAppInstallUrl);

    } catch (dbError) {
        console.error("Database check failed, falling back to direct OAuth:", dbError);
        
        // Final fallback safety loop
        const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
        const params = new URLSearchParams({
            client_id: process.env.GITHUB_CLIENT_ID || '',
            redirect_uri: `${BASE_URL}/auth/github/callback`,
            state: targetUserId || 'dev-test-user-001' 
        });
        res.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
    }
});

// Router 2: The Callback - GitHub sends the user back here
router.get('/github/callback', async (req: Request, res: Response) => {
    // Read the secure state param returned by GitHub to find exactly who this token belongs to
    const { code, state: userId } = req.query;

    if (!code) {
        return res.status(400).send("No code provided from GitHub");
    }

    const finalUserId = (userId as string) || "dev-test-user-001";

    try {
        // Exchange code for Access Token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: `${BASE_URL}/auth/github/callback`
            })
        });

        const data: any = await tokenResponse.json();

        if (data.error) {
            return res.status(400).json(data);
        }

        const accessToken = data.access_token;

        // Save the access token to PostgreSQL mapped dynamically to the authenticated user's ID
        await saveToken(finalUserId, 'github', accessToken);

        // Serve a clean confirmation message to the browser window
        res.send('<h1>GitHub Connected! You can close this window and return to VS Code.</h1>');

    } catch (error) {
        console.error("OAuth Error:", error);
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
router.get('/jira/callback', async (req: Request, res: Response) => {
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

        // ✨ Check accessible sites to verify contextOS app plugin installation bounds
        const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' }
        });

        const accessibleSites = resourcesResponse.data;

        // 🚨 New User lacks app installation on their Atlassian workspace instances
        if (!accessibleSites || accessibleSites.length === 0) {
            // Replace with your real Atlassian plugin application listing site
            const marketplaceUrl = `https://marketplace.atlassian.com/apps/YOUR_APP_ID/contextos`;
            return res.send(`
                <div style="font-family: -apple-system, sans-serif; text-align: center; padding: 50px 20px;">
                    <h1 style="color: #172B4D;">App Installation Required</h1>
                    <p style="color: #5E6C84; font-size: 14px; max-width: 450px; margin: 10px auto 25px auto;">
                        You have authorized your user account, but the contextOS application integration hasn't been added to your Jira Cloud workspace yet.
                    </p>
                    <a href="${marketplaceUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background: #0052CC; color: white; text-decoration: none; border-radius: 3px; font-weight: 500;">
                        Install contextOS from Marketplace
                    </a>
                </div>
            `);
        }

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