import { Octokit } from '@octokit/rest';

export const fetchGitHubPRs = async (file: string, token: string) => {
    const octokit = new Octokit({ auth: token });
    try {
        // If there's a file/folder, we search for that keyword in your PRs.
        // Otherwise, we just list your most recent open PRs.
        const query = file 
            ? `is:pr author:@me state:open ${file}` 
            : 'is:pr author:@me state:open';

        const { data } = await octokit.search.issuesAndPullRequests({
            q: query,
            sort: 'updated', // Sort by recent activity
            order: 'desc',
            per_page: 10
        });

        // FALLBACK: If specific search returns 0, get general active PRs
        if (data.items.length === 0 && file) {
            const general = await octokit.search.issuesAndPullRequests({
                q: 'is:pr author:@me state:open',
                sort: 'updated',
                per_page: 5
            });
            data.items = general.data.items;
        }

        return data.items.map(pr => ({
            id: pr.number.toString(),
            title: pr.title,
            status: pr.state,
            url: pr.html_url,
            repo: pr.repository_url.split('/').pop()
        }));
    } catch (error) {
        console.error("GitHub Fetch Error:", error);
        return [];
    }
};