// Importing required modules
const { Octokit } = require('@octokit/rest'); // GitHub API client

// Setting up Octokit with authentication
const octokit = new Octokit({
  auth: 'ACCESS_TOKEN', // Placeholder token, replace with a valid token
});

// Repository and folder paths
const owner = 'filgoBot'; // Owner of the translated repository
const repo = 'bot-test'; // Name of the translated repository
const originalOwner = 'huseyingulec'; // Owner of the original repository
const originalRepo = 'bot-test'; // Name of the original repository

// Function to get the list of files in a repository
async function getFilesList(owner, repo, path = '') {
  const { data } = await octokit.repos.getContent({ owner, repo, path });
  let files = [];
  for (const item of data) {
    if (item.type === 'dir') {
      files = files.concat(await getFilesList(owner, repo, item.path));
    } else if (item.type === 'file') {
      files.push(item.path);
    }
  }
  return files;
}

// Function to get the content of a file
async function getFileContent(owner, repo, path) {
  const { data } = await octokit.repos.getContent({ owner, repo, path });
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return content.split('\n').length;
}

// Function to create a GitHub issue for a translation update
async function createIssue(filePath, lineDifference) {
  try {
    const response = await octokit.issues.create({
      owner,
      repo,
      title: 'Translation Update Needed',
      body: `The Turkish translation for ${filePath} is out of sync. Please update with the latest changes. Line difference: ${lineDifference}`,
      labels: ['translation-update'],
    });

    console.log('Issue created successfully!');
  } catch (error) {
    console.error(`Error creating issue: ${error.message}`);
  }
}

// Main function to compare files and create issues
async function main() {
  try {
    // Get the list of files in both repositories
    const originalFiles = await getFilesList(originalOwner, originalRepo);
    const translatedFiles = await getFilesList(owner, repo);

    // Find the common markdown files
    const commonFiles = originalFiles.filter(file => translatedFiles.includes(file) && file.endsWith('.md'));

    // For each common file
    for (const file of commonFiles) {
      // Get the number of lines in both files
      let originalLines, translatedLines;
      try {
        originalLines = await getFileContent(originalOwner, originalRepo, file);
        translatedLines = await getFileContent(owner, repo, file);
      } catch (error) {
        console.error(`Error fetching content for file ${file}: ${error.message}`);
        continue; // Skip to the next file
      }

      // If there is a difference
      if (originalLines !== translatedLines) {
        // Create an issue
        try {
          await createIssue(file, originalLines - translatedLines);
        } catch (error) {
          console.error(`Error creating issue for file ${file}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}
// Execute the main function
main().catch(error => console.error(`Unhandled error: ${error.message}`));