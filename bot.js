// Add a deer to the console
const deers = require("deers");
console.log(deers()[3]);

const path = require("path");

// Importing required modules
const { Octokit } = require("@octokit/rest"); // GitHub API client

// Setting up Octokit with authentication
const octokit = new Octokit({
    auth: process.env.ACCESS_TOKEN, // Placeholder token, replace with a valid token
});

// Files to ignore
const filesToIgnore = process.env.IGNORE_FILES.split(","); // Comma separated list of files to ignore

// Repository and folder paths
const translatedOwner = process.env.TRANSLATED_OWNER; // Owner of the translated repository
const translatedRepo = process.env.TRANSLATED_REPO; // Name of the translated repository
const translatedSubdirectory = process.env.TRANSLATED_SUBDIRECTORY; // Subdirectory of the repository to compare
const translatedBranch = process.env.TRANSLATED_BRANCH; // Name of the branch to compare with

const originalOwner = process.env.ORIGINAL_OWNER; // Owner of the original repository
const originalRepo = process.env.ORIGINAL_REPO; // Name of the original repository
const originalSubdirectory = process.env.ORIGINAL_SUBDIRECTORY; // Subdirectory of the repository to compare
const originalBranch = process.env.ORIGINAL_BRANCH; // Name of the branch to compare with

// Function to get the list of files in a repository
async function getFilesList(owner, repo, subdirectory, branch) {
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

// Function to create a map of files
function createFilesArray(files) {
    const filesArray = [];
    for (const filePath of files) {
        const fileName = path.basename(filePath).toLowerCase();
        if (!filesToIgnore.includes(fileName)) {
            filesArray.push(filePath);

        }
    }
    return filesArray;
}

// This function fetches the list of files from both the original and translated repositories and creates maps for them.
async function getFilesAndCreateArrays() {
    const originalFiles = await getFilesList(
        originalOwner,
        originalRepo,
        originalSubdirectory,
        originalBranch
    );
    const translatedFiles = await getFilesList(
        translatedOwner,
        translatedRepo,
        translatedSubdirectory,
        translatedBranch
    );

    const originalFilesArray = createFilesArray(originalFiles);
    const translatedFilesArray = createFilesArray(translatedFiles);

    return { originalFilesArray, translatedFilesArray };
}
// This function finds the common files between the original and translated repositories
function getCommonFiles(original, translated) {
    const commonFiles = original.filter(filePath => 
        translated.includes(filePath) && filePath.endsWith(".md")
    );

    return commonFiles;
}

// This function processes each common file to check if there are new commits in the original repository
async function processCommonFiles(commonFiles) {
    for (const filePath of commonFiles) {
        const originalFilePath = originalSubdirectory + filePath;
        const translatedFilePath = translatedSubdirectory + filePath;
        console.log(originalFilePath);
        console.log(translatedFilePath);

        const fileName = path.basename(filePath).toLowerCase();

        // Get the date of the last commit for the file in the translated repository
        const translatedFileLastCommitDate = await getLastCommitDate(
            translatedOwner,
            translatedRepo,
            translatedFilePath
        );
        // Get the date of the last commit for the file in the original repository
        const originalFileLastCommitDate = await getLastCommitDate(
            originalOwner,
            originalRepo,
            originalFilePath
        );
        // Fetch the list of commits for the file in the original repository
        const { data: originalFileCommits } = await octokit.repos.listCommits({
            owner: originalOwner,
            repo: originalRepo,
            path: originalFilePath,
        });
        // Filter the list of commits to only include those that are newer than the last commit in the translated repository
        const newCommits = originalFileCommits.filter(
            commit =>
                new Date(commit.commit.committer.date) >
                new Date(translatedFileLastCommitDate)
        );

        if (newCommits.length > 0) {
            console.log(
                `Last commit date for ${filePath}: ${originalFileLastCommitDate}`
            );
            console.log(
                `-Found ${newCommits.length} new commits for ${filePath}`
            );

            try {
                await createIssue(
                    originalFilePath,
                    translatedFilePath,
                    fileName,
                    newCommits
                );
            } catch (error) {
                console.error(
                    `--❌Error creating issue for file ${filePath}: ${error.message}`
                );
            }
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
        const originalFileUrl = `https://github.com/${originalOwner}/${originalRepo}/blob/${originalBranch}}/${originalFilePath}`;
        const translatedFileUrl = `https://github.com/${translatedOwner}/${translatedRepo}/blob/${translatedBranch}/${translatedFilePath}`;

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
                newCommitsToComment,
                originalFilePath
            );
            await addCommentToIssue(existingIssue, commitMessages, file);
        } else {
            const commitMessages = await getCommitMessages(
                originalOwner,
                originalRepo,
                newCommits,
                originalFilePath
            );
            await createNewIssue(
                file,
                originalFileUrl,
                translatedFileUrl,
                commitMessages
            );
        }
    } catch (error) {
        console.error(`--❌Error creating issue: ${error.message}`);
    }
}

// Function to get an existing issue for a file in translated repository
async function getExistingIssue(file) {
    const { data: issues } = await octokit.issues.listForRepo({
        translatedOwner,
        translatedRepo,
        state: "open",
    });

    // Find an issue with the same title as the file
    return issues.find(issue => issue.title.includes(file));
}

// Function to filter out the commits that were already commented on
async function filterNewCommits(existingIssue, newCommits) {
    const { data: comments } = await octokit.issues.listComments({
        translatedOwner,
        translatedRepo,
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
async function getCommitMessages(owner, repo, newCommits, path) {
    try {
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
                const formattedDate = formatDate(
                    new Date(data.commit.committer.date)
                );
                // Get the first line of the commit message
                const firstLineMessage = data.commit.message.split("\n")[0];

                // Get the additions and deletions for the file in the commit by passing commit data and path
                const diff = getCommitDiff(data, path);

                return `- [${firstLineMessage}](${commitUrl}) (additions: ${diff.additions}, deletions: ${diff.deletions}) on ${formattedDate} <!-- SHA: ${data.sha} -->`;
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
            translatedOwner,
            translatedRepo,
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
            translatedOwner,
            translatedRepo,
            title: `Translation update needed on \`${file}\``,
            body: `The Odin's file, [${file}](${originalFileUrl}) is updated. Please update the Kampus' file, checkout file here [${file}](${translatedFileUrl}) \n\n Latest commits:\n${commitMessages}`,
            labels: ["curriculum-update"],
        });

        console.log(`--✅Issue created successfully for ${file}`);
    } catch (error) {
        console.error(`--❌Error creating issue: ${error.message}`);
    }
}
// This is the main function that orchestrates the entire process
async function main() {
    try {
        // Fetch the list of files from both the original and translated repositories and create maps for them
        const { originalFilesArray, translatedFilesArray } =
            await getFilesAndCreateArrays();

        // Find the common files between the original and translated repositories
        const commonFiles = getCommonFiles(
            originalFilesArray,
            translatedFilesArray
        );

        console.log(`Found ${commonFiles.length} common markdown files.`);

        if (commonFiles.length === 0) {
            console.log("No common markdown files found.");
            return;
        }

        // Process each common file to check if there are new commits in the original repository
        await processCommonFiles(commonFiles);
    } catch (error) {
        console.error(`-Error: ${error.message}`);
    }
}

main().catch(error => console.error(`Unhandled error: ${error.message}`));
