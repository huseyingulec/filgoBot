// Add a deer to the console
const deers = require("deers");
console.log(deers()[3]);

// Importing required modules
const { Octokit } = require("@octokit/rest"); // GitHub API client

// Setting up Octokit with authentication
const octokit = new Octokit({
    auth: process.env.ACCESS_TOKEN, // Placeholder token, replace with a valid token
});

// Files to ignore
const filesToIgnore = process.env.IGNORE_FILES.split(","); // Comma separated list of files to ignore

// Repository and folder paths
const owner = process.env.OWNER; // Owner of the translated repository
const repo = process.env.REPO; // Name of the translated repository
const branch = process.env.BRANCH; // Name of the branch to compare with

const originalOwner = process.env.ORIGINAL_OWNER; // Owner of the original repository
const originalRepo = process.env.ORIGINAL_REPO; // Name of the original repository
const originalBranch = process.env.ORIGINAL_BRANCH; // Name of the branch to compare with

// Function to get the list of files in a repository
async function getFilesList(owner, repo, branch) {
    let files = [];

    try {
        const { data } = await octokit.git.getTree({
            owner,
            repo,
            tree_sha: branch, // or the name of the default branch
            recursive: "1",
        });

        files = data.tree
            .filter(item => item.type === "blob")
            .map(item => item.path);

        console.log(
            `Found ${files.length} files in the ${owner}/${repo} repository.`
        ); // Log the number of files found
    } catch (error) {
        console.error(`Error fetching files: ${error.message}`);

        throw error; // Rethrow the error after logging it
    }
    return files;
}

// Function to create a map of file names to file paths
function createFilesMap(files) {
    return files.reduce((map, file) => {
        const fileName = file.split("/").pop().toLowerCase();
        if (!filesToIgnore.includes(fileName)) {
            map[fileName] = file;
        }
        return map;
    }, {});
}

async function getFilesAndCreateMaps() {
    const originalFiles = await getFilesList(
        originalOwner,
        originalRepo,
        originalBranch
    );
    const translatedFiles = await getFilesList(owner, repo, branch);

    const originalFilesMap = createFilesMap(originalFiles);
    const translatedFilesMap = createFilesMap(translatedFiles);

    return { originalFilesMap, translatedFilesMap };
}

function getCommonFiles(originalFilesMap, translatedFilesMap) {
    const translatedFileNames = Object.keys(translatedFilesMap);

    const commonFiles = translatedFileNames.filter(
        file => originalFilesMap.hasOwnProperty(file) && file.endsWith(".md")
    );

    return commonFiles;
}

async function processCommonFiles(
    commonFiles,
    originalFilesMap,
    translatedFilesMap
) {
    for (const file of commonFiles) {
        const originalFilePath = originalFilesMap[file];
        const translatedFilePath = translatedFilesMap[file];

        const translatedFileLastCommitDate = await getLastCommitDate(
            owner,
            repo,
            translatedFilePath
        );
        const originalFileLastCommitDate = await getLastCommitDate(
            originalOwner,
            originalRepo,
            originalFilePath
        );

        const { data: originalFileCommits } = await octokit.repos.listCommits({
            owner: originalOwner,
            repo: originalRepo,
            path: originalFilePath,
        });

        const newCommits = originalFileCommits.filter(
            commit =>
                new Date(commit.commit.committer.date) >
                new Date(translatedFileLastCommitDate)
        );

        if (newCommits.length > 0) {
            console.log(
                `Last commit date for ${file}: ${originalFileLastCommitDate}`
            );
            console.log(`-Found ${newCommits.length} new commits for ${file}`);

            try {
                await createIssue(
                    originalFilePath,
                    translatedFilePath,
                    file,
                    newCommits
                );
            } catch (error) {
                console.error(
                    `--Error creating issue for file ${file}: ${error.message}`
                );
            }
        } else {
            console.log(`-No new commits found for ${file}`);
        }
    }
}

// Function to get the date of the last commit for a file
async function getLastCommitDate(owner, repo, path) {
    let date;
    try {
        const { data: commits } = await octokit.repos.listCommits({
            owner,
            repo,
            path,
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

// Function to create a GitHub issue for a translation update
async function createIssue(
    originalFilePath,
    translatedFilePath,
    file,
    newCommits
) {
    try {
        const originalFileUrl = `https://github.com/${originalOwner}/${originalRepo}/blob/main/${originalFilePath}`;
        const translatedFileUrl = `https://github.com/${owner}/${repo}/blob/main/${translatedFilePath}`;

        const existingIssue = await getExistingIssue(file);
        if (existingIssue) {
            console.log(`--Issue already exists for file ${file}`);
            const newCommitsToComment = await filterNewCommits(
                existingIssue,
                newCommits
            );

            if (newCommitsToComment.length === 0) {
                console.log(`---No new commits to comment for ${file}`);
                return;
            }

            const commitMessages = await getCommitMessages(
                originalOwner,
                originalRepo,
                newCommitsToComment
            );
            await addCommentToIssue(existingIssue, commitMessages, file);
        } else {
            const commitMessages = await getCommitMessages(
                originalOwner,
                originalRepo,
                newCommits
            );
            await createNewIssue(
                file,
                originalFileUrl,
                translatedFileUrl,
                commitMessages
            );
        }
    } catch (error) {
        console.error(`--Error creating issue: ${error.message}`);
    }
}

// Function to get an existing issue for a file
async function getExistingIssue(file) {
    const { data: issues } = await octokit.issues.listForRepo({
        owner,
        repo,
        state: "open",
    });

    // Find an issue with the same title as the file
    return issues.find(issue => issue.title.includes(file));
}

// Function to filter out the commits that were already commented on
async function filterNewCommits(existingIssue, newCommits) {
    const { data: comments } = await octokit.issues.listComments({
        owner,
        repo,
        issue_number: existingIssue.number,
    });

    // Filter out the commits that were already commented on
    return newCommits.filter(
        commit =>
            ![
                existingIssue.body,
                ...comments.map(comment => comment.body),
            ].some(text => text.includes(commit.sha))
    );
}

// Function to get the commit messages for new commits
async function getCommitMessages(owner, repo, newCommits) {
    const commitDetails = await Promise.all(
        newCommits.map(commit =>
            octokit.repos.getCommit({
                owner,
                repo,
                ref: commit.sha,
            })
        )
    );

    // Create a list of commit messages
    return commitDetails
        .map(({ data }) => {
            const commitUrl = `https://github.com/${owner}/${repo}/commit/${data.sha}`;

            let commitDate = new Date(data.commit.committer.date);
            let options = {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZone: "UTC",
                timeZoneName: "short",
            };
            let formattedDate = commitDate
                .toLocaleString("en-US", options)
                .replace(",", "")
                .replace(" GMT", "");

            const firstLineMessage = data.commit.message.split("\n")[0];

            return `- [${firstLineMessage}](${commitUrl}) (additions: ${data.stats.additions}, deletions: ${data.stats.deletions}) on ${formattedDate} <!-- SHA: ${data.sha} -->`;
        })
        .join("\n");
}

// Function to add a comment to an existing issue
async function addCommentToIssue(existingIssue, commitMessages, file) {
    try {
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: existingIssue.number,
            body: `New commits have been made to the Odin's file. Please update the Kampus' file.\n\n Latest commits:\n${commitMessages}`,
        });

        console.log(`---Comment added to issue for ${file}`);
    } catch (error) {
        console.error(`---Error adding comment to issue: ${error.message}`);
    }
}

// Function to create a new issue
async function createNewIssue(
    file,
    originalFileUrl,
    translatedFileUrl,
    commitMessages
) {
    try {
        await octokit.issues.create({
            owner,
            repo,
            title: `Translation update needed on \`${file}\``,
            body: `The Odin's file, [${file}](${originalFileUrl}) is updated. Please update the Kampus's file, checkout file here [${file}](${translatedFileUrl}) \n\n Latest commits:\n${commitMessages}`,
            labels: ["curriculum-update"],
        });

        console.log(`--Issue created successfully for ${file}`);
    } catch (error) {
        console.error(`--Error creating issue: ${error.message}`);
    }
}

async function main() {
    try {
        const { originalFilesMap, translatedFilesMap } =
            await getFilesAndCreateMaps();
        const commonFiles = getCommonFiles(
            originalFilesMap,
            translatedFilesMap
        );

        console.log(`Found ${commonFiles.length} common markdown files.`);

        if (commonFiles.length === 0) {
            console.log("No common markdown files found.");
            return;
        }

        await processCommonFiles(
            commonFiles,
            originalFilesMap,
            translatedFilesMap
        );
    } catch (error) {
        console.error(`-Error: ${error.message}`);
    }
}

main().catch(error => console.error(`Unhandled error: ${error.message}`));
