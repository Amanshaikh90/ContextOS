import {Octokit} from '@octokit/rest';


export const fetchGitHubPRs = async (token:string) => {
    const octokit = new Octokit({auth:token});

    // this search query finds PRs created 

    const {data} = await octokit.search.issuesAndPullRequests({
        q:'is:pr author:@me state:open',
        sort:'created',
        order:'desc',
        per_page:5
    });


    return data.items.map(pr=>({
        id:pr.number.toString(),
        title:pr.title,
        status:pr.state,
        url:pr.html_url,
        repo:pr.repository_url.split('/').pop() // getting repo name from
    }));
};
