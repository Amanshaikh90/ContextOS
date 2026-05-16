// server/src/services/github.ts
import { Octokit } from '@octokit/rest';

// server/src/services/github.ts
// server/src/services/github.ts
export const fetchGitHubPRs = async (file: string, token: string, repoName?: string) => {
    const octokit = new Octokit({ auth: token });
    try {
        const { data: user } = await octokit.users.getAuthenticated();
        const username = user.login;

        // Construct a query that looks for PRs in YOUR repos, 
        // filtered by the specific repo name if provided.
        let query = "";
        
        if (repoName && repoName !== "Unknown Project" && repoName.trim() !== "") {
            // Focus ONLY on the specific repo
            query = `repo:${username}/${repoName} is:pr`;
        } else {
            // Default to all user PRs if no repo is specified
            query = `user:${username} is:pr`;
        }

        if (file && !["No file open", ".", "/", ""].includes(file)) {
            query += ` ${file}`;
        }
        console.log("DEBUG: Final GitHub Query ->", query);

        const { data } = await octokit.search.issuesAndPullRequests({
            q: query,
            sort: 'updated',
            order: 'desc',
            per_page: 20 // Increased to see both open and merged
        });

        return data.items.map((pr: any) => ({
            id: pr.number.toString(),
            title: pr.title,
            status: pr.pull_request?.merged_at || pr.merged_at ? 'merged' : pr.state,
            url: pr.html_url,
            repo: pr.repository_url.split('/').pop() || 'Unknown'
        }));
    } catch (error) {
        console.error("GitHub Fetch Error:", error);
        return [];
    }
};