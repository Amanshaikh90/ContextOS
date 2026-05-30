import axios from 'axios';
import { deleteToken, getTokenByUserId, saveToken } from './dbHelper.js';



const refreshJiraToken = async (userId: string, refreshToken: string) => {
    try {
        const response = await axios.post('https://auth.atlassian.com/oauth/token', {
            grant_type: 'refresh_token',
            client_id: process.env.JIRA_CLIENT_ID,
            client_secret: process.env.JIRA_CLIENT_SECRET,
            refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefreshToken } = response.data;
        await saveToken(userId, 'jira', access_token, newRefreshToken);
        return access_token;
    } catch (error: any) {
        console.error("Failed to refresh Jira token:", error.response?.data || error.message);

        // If the refresh token is invalid, delete the stored token so the user can re-auth cleanly
        if (error.response?.status === 401 || error.response?.status === 400) {
            console.log(`[Jira] Removing invalid token for user ${userId}`);
            await deleteToken(userId, 'jira');   // uses your existing dbHelper.deleteToken
        }
        return null;
    }
};

export const fetchJiraTickets:any = async (file: string, token: string,userId?:string) => {
    try {
        const accessibleResources = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        if (!accessibleResources.data || accessibleResources.data.length === 0) {return [];}
        const cloudId = accessibleResources.data[0].id;
        const siteName = accessibleResources.data[0].name;

        // Try searching for the file/folder keyword first
        let jql = `assignee = currentUser() AND statusCategory != Done`;
        if (file) {
            jql = `text ~ "${file}" AND ${jql}`;
        }

        let response = await axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`, {
            params: { jql, maxResults: 5, fields: "summary,status" },
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        // FALLBACK: If 0 results for specific file, show all active tickets
        if (response.data.issues.length === 0 && file) {
            const fallbackJql = `assignee = currentUser() AND statusCategory != Done`;
            response = await axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`, {
                params: { jql: fallbackJql, maxResults: 5, fields: "summary,status" },
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
            });
        }

        return response.data.issues.map((issue: any) => ({
            id: issue.key,
            title: issue.fields.summary,
            status: issue.fields.status.name,
            url: `https://${siteName}.atlassian.net/browse/${issue.key}`
        }));
    } catch (error: any) {
        // auto refresh token
        if(error.response?.status===401&&userId){
            console.log("jira token expired, attenmpting refresh");
            const record = await getTokenByUserId(userId,'jira');
            if(record?.refreshToken){
                const newToken=await refreshJiraToken(userId,record.refreshToken);
                if(newToken) {
                    return fetchJiraTickets(file,newToken,userId);
                }
            }
        }
        console.error("Jira API Fetch Error:", error.response?.data || error.message);
        return [];
    }
};

