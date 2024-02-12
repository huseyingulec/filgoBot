// Add a deer to the console
const deers = require("deers");
console.log(deers()[3]);
require('dotenv').config();

const path = require("path");

// Importing required modules
const { Octokit } = require("@octokit/rest"); // GitHub API client

// Setting up Octokit with authentication
const octokit = new Octokit({
    auth: process.env.ACCESS_TOKEN, // Placeholder token, replace with a valid token
});

// Files to ignore
const filesToIgnore = process.env.IGNORE_FILES.split(",").map(file =>
    file.toLowerCase()
);

// Repository and folder paths
const translatedOwner = process.env.TRANSLATED_OWNER; // Owner of the translated repository
const translatedRepo = process.env.TRANSLATED_REPO; // Name of the translated repository
const translatedSubdirectory = process.env.TRANSLATED_SUBDIRECTORY; // Subdirectory of the repository to compare
const translatedBranch = process.env.TRANSLATED_BRANCH; // Name of the branch to compare with

const originalOwner = process.env.ORIGINAL_OWNER; // Owner of the original repository
const originalRepo = process.env.ORIGINAL_REPO; // Name of the original repository
const originalSubdirectory = process.env.ORIGINAL_SUBDIRECTORY; // Subdirectory of the repository to compare
const originalBranch = process.env.ORIGINAL_BRANCH; // Name of the branch to compare with

const issueLabel = JSON.parse(process.env.ISSUE_LABEL);

// Function to check the rate limit status
async function checkRateLimit() {
    const { data } = await octokit.rateLimit.get();
    console.log(
        `API Limit:${data.resources.core.remaining}/5000, Used:${5000-data.resources.core.remaining}, Reset Time:${new Date(data.resources.core.reset * 1000)}`, 
    ); // This will log the core limit status
}

// This is the main function that orchestrates the entire process
async function main() {
    try {
        await checkRateLimit();
        const { originalFilesArray, translatedFilesArray } =
            await getFilesArray();
        const commonFiles = getCommonFiles(
            originalFilesArray,
            translatedFilesArray
        );

        console.log(`Found ${commonFiles.length} common markdown files.`);

        if (commonFiles.length === 0) {
            console.log("No common markdown files found.");
            return;
        }
        // for performance reasons, fetch all open and closed issues with comments in the translated repository at once
        await fetchAllOpenIssues(); 
        await fetchAllClosedIssuesWithComments(); 

        // Process each common file to check if there are new commits in the original repository
        await processCommonFiles(commonFiles);
        await checkRateLimit();
    } catch (error) {
        console.error(`-Error: ${error.message}`);
    }
}

main().catch(error => console.error(`Unhandled error: ${error.message}`));

// This function fetches the list of files from both the original and translated repositories and creates arrays for them.
async function getFilesArray() {
    const originalFilesArray = await getFilesList(
        originalOwner,
        originalRepo,
        originalSubdirectory,
        originalBranch
    );
    const translatedFilesArray = await getFilesList(
        translatedOwner,
        translatedRepo,
        translatedSubdirectory,
        translatedBranch
    );
    return { originalFilesArray, translatedFilesArray };
}

// Function to get the list of files in a repository
async function getFilesList(owner, repo, subdirectory, branch) {
    let files = [];

    try {
        const { data } = await octokit.git.getTree({
            owner: owner,
            repo: repo,
            tree_sha: branch,
            recursive: "1",
        });

        files = data.tree
            .filter(item => item.type === "blob")
            .map(item => item.path.replace(subdirectory, "")); // Remove the subdirectory from the file path

        console.log(
            `Found ${files.length} files in the ${owner}/${repo} repository.`
        ); // Log the number of files found
    } catch (error) {
        console.error(`Error fetching files: ${error.message}`);

        throw error; // Rethrow the error after logging it
    }
    return files;
}

// This function finds the common files between the original and translated repositories
function getCommonFiles(originalArray, translatedArray) {
    const commonFiles = originalArray.filter(
        filePath =>
            translatedArray.includes(filePath) &&
            filePath.endsWith(".md") &&
            !filesToIgnore.includes(filePath.toLowerCase())
    );

    return commonFiles;
}

// This function processes each common file to check if there are new commits in the original repository
async function processCommonFiles(commonFiles) {
    for (const filePath of commonFiles) {
        const originalFilePath = originalSubdirectory + filePath;
        const translatedFilePath = translatedSubdirectory + filePath;

        // Get the date of the last commit for the file in the translated repository
        const translatedFileLastCommitDate = await getLastCommitDate(
            translatedOwner,
            translatedRepo,
            translatedFilePath
        );
        // Fetch the list of commits for the file in the original repository
        const { data: originalFileCommits } = await octokit.repos.listCommits({
            owner: originalOwner,
            repo: originalRepo,
            path: originalFilePath,
        });
        // Filter the list of commits to only include those that are newer than the last commit in the translated repository
        const commits = originalFileCommits.filter(
            commit =>
                new Date(commit.commit.committer.date) >
                new Date(translatedFileLastCommitDate)
        );
        // Filter out the commits that are already resolved in a closed issue
        let newCommits = [];
        for (const commit of commits) {
            const isInClosedIssues = await isCommitInClosedIssues(
                commit,
                filePath
            );
            if (!isInClosedIssues) {
                newCommits.push(commit);
            }
        }

        if (newCommits.length > 0) {
            console.log(
                `-Found ${newCommits.length} new commits for ${filePath}`
            );

            await createIssue(
                originalFilePath,
                translatedFilePath,
                newCommits,
                filePath
            );
        } else {
            console.log(`-No new commits found for ${filePath}`);
        }
    }
}

// Function to get the date of the last commit for a file
async function getLastCommitDate(owner, repo, path) {
    let date;
    try {
        const { data: commits } = await octokit.repos.listCommits({
            owner: owner,
            repo: repo,
            path: path,
        });

        if (commits.length > 0) {
            date = commits[0].commit.committer.date;
        }
    } catch (error) {
        console.error(
            `Error fetching commits for file ${path} in the ${owner}/${repo} repository: ${error.message}`
        );
    }
    return date;
}
// Define a global variable to store the list of closed issues with comments
let closedIssuesWithComments = [];
// function to fetch all closed issues and their comments in the translated repository
async function fetchAllClosedIssuesWithComments() {
    const closedIssues = await octokit.paginate(octokit.issues.listForRepo, {
        owner: translatedOwner,
        repo: translatedRepo,
        state: "closed",
        creator: "filgoBot",
        per_page: 100, // 100 is the maximum number of items that can be returned per page
    });

    closedIssuesWithComments = await Promise.all(
        closedIssues.map(async issue => {
            const comments = await octokit.paginate(
                octokit.issues.listComments,
                {
                    owner: translatedOwner,
                    repo: translatedRepo,
                    issue_number: issue.number,
                }
            );

            return {
                ...issue,
                comments,
            };
        })
    );
}
// Function to check if a commit is already resolved in a closed issue
async function isCommitInClosedIssues(commit, filePath) {
    const commitIdentifier = `${commit.sha}:${filePath}`;

    for (const issue of closedIssuesWithComments) {
        const texts = [
            issue.body,
            ...issue.comments.map(comment => comment.body),
        ];
        if (texts.some(text => text.includes(commitIdentifier))) {
            console.log(
                `----Commit is already resolved for ${filePath} in closed issue ${issue.number}`
            );
            return true;
        }
    }
    return false;
}

// Function to create a GitHub issue for a translation update
async function createIssue(
    originalFilePath,
    translatedFilePath,
    newCommits,
    filePath
) {
    try {
        const fileName = path.basename(filePath);
        const originalFileUrl = `https://github.com/${originalOwner}/${originalRepo}/blob/${originalBranch}/${originalFilePath}`;
        const translatedFileUrl = `https://github.com/${translatedOwner}/${translatedRepo}/blob/${translatedBranch}/${translatedFilePath}`;

        const existingIssue = await getExistingIssue(filePath);
        if (existingIssue) {
            console.log(`--Issue already exists for file ${filePath}`);
            const newCommitsToComment = await filterNewCommits(
                existingIssue,
                newCommits,
                filePath
            );

            if (newCommitsToComment.length === 0) {
                console.log(`---No new commits to comment for ${filePath}`);
                return;
            }

            const commitMessages = await getCommitMessages(
                newCommitsToComment,
                originalFilePath,
                filePath
            );
            await addCommentToIssue(existingIssue, commitMessages, fileName);
        } else {
            const commitMessages = await getCommitMessages(
                newCommits,
                originalFilePath,
                filePath
            );
            await createNewIssue(
                fileName,
                originalFileUrl,
                translatedFileUrl,
                commitMessages
            );
        }
    } catch (error) {
        console.error(`--❌Error creating issue: ${error.message}`);
    }
}

// Define a global variable to store the list of open issues
let openIssues = [];

// Function to fetch all open issues and their comments in the translated repository
async function fetchAllOpenIssues() {
    try {
        const issues = await octokit.paginate(octokit.issues.listForRepo, {
            owner: translatedOwner,
            repo: translatedRepo,
            state: "open",
            creator: "filgoBot",
            per_page: 100,
        });

        openIssues = await Promise.all(
            issues.map(async issue => {
                const comments = await octokit.paginate(
                    octokit.issues.listComments,
                    {
                        owner: translatedOwner,
                        repo: translatedRepo,
                        issue_number: issue.number,
                    }
                );

                return {
                    ...issue,
                    comments,
                };
            })
        );
    } catch (error) {
        console.error(`Failed to fetch issues: ${error}`);
    }
}
// Function to get an existing issue for a filePath
async function getExistingIssue(filePath) {
    const existingIssue = openIssues.find(issue =>
        issue.body.includes(filePath)
    );

    return existingIssue;
}

// Function to filter out the commits that were already commented on
async function filterNewCommits(existingIssue, newCommits, filePath) {
    // Filter out the commits that were already commented on
    return newCommits.filter(
        commit =>
            ![
                existingIssue.body,
                ...existingIssue.comments.map(comment => comment.body),
            ].some(text => text.includes(`${commit.sha}:${filePath}`))
    );
}
// Define options for date formatting
const DATE_OPTIONS = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
};

// Function to format a date according to the defined options
function formatDate(date) {
    return date
        .toLocaleString("en-US", DATE_OPTIONS) // Convert the date to a string using the defined options
        .replace(",", "") // Remove commas from the date string
        .replace(" GMT", ""); // Remove " GMT" from the date string
}

// Function to get the commit messages for new commits
async function getCommitMessages(newCommits, path, filePath) {
    try {
        const commitDetails = await Promise.all(
            newCommits.map(commit =>
                octokit.repos.getCommit({
                    owner: originalOwner,
                    repo: originalRepo,
                    ref: commit.sha,
                })
            )
        );

        // Create a list of commit messages
        return commitDetails
            .map(({ data }) => {
                const commitUrl = data.html_url;
                const formattedDate = formatDate(
                    new Date(data.commit.committer.date)
                );
                // Get the first line of the commit message
                const firstLineMessage = data.commit.message.split("\n")[0];

                // Get the additions and deletions for the file in the commit by passing commit data and path
                const diff = getCommitDiff(data, path);

                return `- [${firstLineMessage}](${commitUrl}) (additions: ${diff.additions}, deletions: ${diff.deletions}) on ${formattedDate} <!-- commitIdentifier: ${data.sha}:${filePath} -->`;
            })
            .join("\n");
    } catch (error) {
        console.error(`Error getting commit messages: ${error.message}`);
    }
}

function getCommitDiff(commit, path) {
    // Find the file in the commit that matches the path
    const file = commit.files.find(file => file.filename === path);

    // Return the additions and deletions for the specific file not the entire commit
    return {
        additions: file.additions,
        deletions: file.deletions,
    };
}

// Function to add a comment to an existing issue
async function addCommentToIssue(existingIssue, commitMessages, file) {
    try {
        await octokit.issues.createComment({
            owner: translatedOwner,
            repo: translatedRepo,
            issue_number: existingIssue.number,
            body: `New commits have been made to the Odin's file. Please update the Kampus' file.\n\n Latest commits:\n${commitMessages}`,
        });

        console.log(`---✅Comment added to issue for ${file}`);
    } catch (error) {
        console.error(`---❌Error adding comment to issue: ${error.message}`);
    }
}

// Function to create a new issue in the translated repository
async function createNewIssue(
    file,
    originalFileUrl,
    translatedFileUrl,
    commitMessages
) {
    try {
        await octokit.issues.create({
            owner: translatedOwner,
            repo: translatedRepo,
            title: `Curriculum update needed on \`${file}\``,
            body: `The Odin's file, [${file}](${originalFileUrl}) is updated. Please update the Kampus' file, checkout file here [${file}](${translatedFileUrl}) \n\n Latest commits:\n${commitMessages}`,
            labels: issueLabel,
        });

        console.log(`--✅Issue created successfully for ${file}`);
    } catch (error) {
        console.error(`--❌Error creating new issue: ${error.message}`);
    }
}
