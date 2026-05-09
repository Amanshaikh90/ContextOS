import axios from 'axios';

export const fetchJiraTickets = async (file: string, token: string) => {
    try {
        // STEP 1: Get the 'cloudId'
        //  Jira needs a unique ID for the specific workspace (e.g., your-company.atlassian.net)
        const accessibleResources = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        // Checking user actually has any Jira sites connected
        if (!accessibleResources.data || accessibleResources.data.length === 0) {
            console.log("No Jira resources found for this token.");
            return [];
        }

        // using the first available site (cloudId)
        const cloudId = accessibleResources.data[0].id;

        // STEP 2: Fetch Tickets using JQL
        // using the 'file' parameter to make it context-aware (filtering by filename)
        const jql = file 
            ? `text ~ "${file}" AND assignee = currentUser()` 
            : `assignee = currentUser() AND statusCategory != Done`;

        const response = await axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`, {
            params: {
                jql: jql,
                maxResults: 5,
                fields: "summary,status,updated" // Only get what we need
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        // STEP 3: Map the data for your VS Code Sidebar
        return response.data.issues.map((issue: any) => ({
            id: issue.key,
            title: issue.fields.summary,
            status: issue.fields.status.name,
            url: `https://${accessibleResources.data[0].name}.atlassian.net/browse/${issue.key}`
        }));

    } catch (error: any) {
        // Log the error but return empty array so index.ts doesn't crash
        console.error("Jira API Fetch Error:", error.response?.data || error.message);
        return [];
    }
};