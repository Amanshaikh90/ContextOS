import { Octokit } from '@octokit/rest';

/**
 * NEW VALIDATION HELPER
 * Explicitly checks if the authenticated user has installed the contextos-beta 
 * GitHub App on at least one repository.
 */
export const checkGitHubInstallation = async (token: string): Promise<boolean> => {
    const octokit = new Octokit({ auth: token });
    try {
        // Query the installations endpoint for the authenticated token
        const { data } = await octokit.apps.listInstallationsForAuthenticatedUser({
            per_page: 1
        });
        // If total_count is greater than 0, the app is actively installed on repos
        return data.total_count > 0;
    } catch (error) {
        console.error("Failed to check GitHub App Installation status:", error);
        return false; 
    }
};

export const fetchGitHubPRs = async (file: string, token: string, repoName?: string) => {
    const octokit = new Octokit({ auth: token });
    try {
        // 庁 FIX 1: Changed "is:pr" to "type:pr" to catch active + merged/closed states by default
        let query = "type:pr author:@me"; // Safe default for all tokens
        let hasSpecificRepo = false;
        
        // 庁 FIX 2: Added "none" check to prevent empty repository logic from breaking the query path
        if (repoName && repoName !== "Unknown Project" && repoName.trim() !== "" && repoName.trim().toLowerCase() !== "none") {
            const cleanRepo = repoName.trim();
            hasSpecificRepo = true;
            
            if (cleanRepo.includes('/')) {
                query = `repo:${cleanRepo} type:pr`;
            } else {
                query = `user:@me repo:${cleanRepo} type:pr`;
            }
        }

        console.log("DEBUG: Running GitHub Query ->", query);

        const { data } = await octokit.search.issuesAndPullRequests({
            q: query,
            sort: 'updated',
            order: 'desc',
            per_page: 20
        });

        // Fail-safe protection if data or items array comes back missing
        if (!data || !data.items) {return [];}

        const safeTargetRepo = (repoName || "").trim().toLowerCase();
        const targetRepoNameOnly = safeTargetRepo.includes('/') ? safeTargetRepo.split('/').pop() : safeTargetRepo;

        return data.items.map((pr: any) => {
            // 庁 FIXED: Use explicit repository matching from GitHub's search payload metadata fields
            let parsedRepoName = 'Unknown';
            
            if (pr.repository?.full_name) {
                parsedRepoName = pr.repository.full_name;
            } else if (pr.repository_url) {
                const urlParts = pr.repository_url.split('/');
                parsedRepoName = urlParts.length >= 2
                    ? `${urlParts[urlParts.length - 2]}/${urlParts[urlParts.length - 1]}`
                    : 'Unknown';
            }

            return {
                id: pr.number.toString(),
                title: pr.title,
                status: pr.pull_request?.merged_at || pr.merged_at ? 'merged' : pr.state,
                url: pr.html_url,
                repo: parsedRepoName
            };
        })
        .filter((pr: any) => {
            // 庁 FIX 3: If no repository is active or if the context is explicitly "none", do not drop the records.
            // Allow recent global user PR layout streams to populate.
            if (!hasSpecificRepo || safeTargetRepo === "none") {
                return true; 
            }

            const cleanPRRepo = pr.repo.trim().toLowerCase();
            const shortPRRepo = cleanPRRepo.includes('/') ? cleanPRRepo.split('/').pop() : cleanPRRepo;

            // 庁 FIXED: Fallback safety checklist - if the PR came from this explicit repository query, don't drop it
            if (cleanPRRepo === "unknown" && hasSpecificRepo) {
                return true;
            }

            return cleanPRRepo === safeTargetRepo || shortPRRepo === targetRepoNameOnly;
        });
        
    } catch (error) {
        console.error("GitHub Core Fetch Failure:", error);
        return []; 
    }
};