// Importing required modules
const { Octokit } = require('@octokit/rest'); // GitHub API client

// Setting up Octokit with authentication
const octokit = new Octokit({
  auth: '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', // Placeholder token, replace with a valid token
});

// Repository and folder paths
const owner = 'filgoBot'; // Owner of the translated repository
const repo = 'bot-test'; // Name of the translated repository
const originalOwner = 'TheOdinProject'; // Owner of the original repository
const originalRepo = 'curriculum'; // Name of the original repository

// Function to get the list of files in a repository
async function getFilesList(owner, repo) {
  let files = [];

  try {
    const { data } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: 'main', // or the name of the default branch
      recursive: '1',
    });

    files = data.tree.filter(item => item.type === 'blob').map(item => item.path);

    console.log(`Found ${files.length} files in the ${owner}/${repo} repository.`); // Log the number of files found
  } catch (error) {
    console.error(`Error fetching files: ${error.message}`);
  }

  return files;
}

// Function to get the content of a file
async function getFileContent(owner, repo, path) {
  let content;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    content = Buffer.from(data.content, 'base64').toString('utf-8');
    
  } catch (error) {
    console.error(`Error fetching content for file ${path} in the ${owner}/${repo} repository: ${error.message}`);
  }
  return content.split('\n').length;
}

// Function to create a GitHub issue for a translation update
async function createIssue(originalFilePath, translatedFilePath, file, lineDifference) {
  const originalFileUrl = `https://github.com/${originalOwner}/${originalRepo}/blob/main/${originalFilePath}`;
  const translatedFileUrl = `https://github.com/${owner}/${repo}/blob/main/${translatedFilePath}`;

  // Get the list of issues for the repository
  const { data: issues } = await octokit.issues.listForRepo({
    owner,
    repo,
    state: 'open', // Only get open issues
  });

  // Check if an issue already exists for the file
  const existingIssue = issues.find(issue => issue.title.includes(file));

  // If an issue already exists, don't create a new one
  if (existingIssue) {
    console.log(`Issue already exists for file ${file}`);
    return;
  }

  // Create the issue
  try {
    const response = await octokit.issues.create({
      owner,
      repo,
      title: `Translation Update Needed on \`${file}\``,
      body: `The Turkish translation for [${file}](${originalFileUrl}) is out of sync. Please update with the latest changes. Line difference: ${lineDifference}. Checkout turkish file here [${file}](${translatedFileUrl}) `,
      labels: ['curriculum-update'],
    });

    console.log(`Issue created successfully for ${file}`);
    
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

    // Create a map of file names to file paths for the original files
    const originalFilesMap = originalFiles.reduce((map, file) => {
      const fileName = file.split('/').pop().toLowerCase();
      map[fileName] = file;
      return map;
    }, {});

    // Create a map of file names to file paths for the translated files
    const translatedFilesMap = translatedFiles.reduce((map, file) => {
      const fileName = file.split('/').pop().toLowerCase();
      map[fileName] = file;
      return map;
    }, {});

    // Extract file names from file paths
    const translatedFileNames = Object.keys(translatedFilesMap);

    // Find the common markdown files
    const commonFiles = translatedFileNames.filter(file => originalFilesMap.hasOwnProperty(file) && file.endsWith('.md'));

    console.log(`Found ${commonFiles.length} common markdown files.`); // Log the number of common files

    if (commonFiles.length === 0) {
      console.log('No common markdown files found.');
      return;
    }

    // For each common file
    for (const file of commonFiles) {
      // Get the full path of the original file
      const originalFilePath = originalFilesMap[file];
      const translatedFilePath = translatedFilesMap[file];

      // Get the number of lines in both files
      let originalLines, translatedLines;
      try {
        originalLines = await getFileContent(originalOwner, originalRepo, originalFilePath);
        translatedLines = await getFileContent(owner, repo, file);
      } catch (error) {
        console.error(`Error fetching content for file ${file}: ${error.message}`);
        continue; // Skip to the next file
      }

      // If there is a difference
      if (originalLines !== translatedLines) {
        // Create an issue
        try {
          await createIssue(originalFilePath, translatedFilePath, file, originalLines - translatedLines);
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