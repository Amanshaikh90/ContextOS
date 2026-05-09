import { Octokit } from '@octokit/rest';

export const fetchGitHubPRs = async (file: string, token: string) => {
    const octokit = new Octokit({ auth: token });

    try {
        // search for PRs that mention the filename.
        // Otherwise, just show open PRs.
        const query = file 
            ? `is:pr author:@me state:open ${file}` 
            : 'is:pr author:@me state:open';

        const { data } = await octokit.search.issuesAndPullRequests({
            q: query,
            sort: 'created',
            order: 'desc',
            per_page: 5
        });

        return data.items.map(pr => ({
            id: pr.number.toString(),
            title: pr.title,
            status: pr.state,
            url: pr.html_url,
            repo: pr.repository_url.split('/').pop()
        }));
    } catch (error) {
        console.error("GitHub Fetch Error:", error);
        return []; // Important for Promise.all safety
    }
};