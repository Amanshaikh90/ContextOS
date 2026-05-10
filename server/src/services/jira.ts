import axios from 'axios';

export const fetchJiraTickets = async (file: string, token: string) => {
    try {
        const accessibleResources = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });

        if (!accessibleResources.data || accessibleResources.data.length === 0) return [];
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
        console.error("Jira API Fetch Error:", error.response?.data || error.message);
        return [];
    }
};

