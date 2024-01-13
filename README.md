# filgoBot [more detailed overview is below](#detailed-overview)

This bot facilitates the updating of two GitHub repositories by identifying common Markdown files and managing their commit histories. It streamlines the process of tracking changes between original and translated files, automating the creation of issues for updates.

## Currently we are using this bot for [turkce-odin-project](https://github.com/kamp-us/monorepo/tree/dev/content/odin), check it out!

## How It Works

### Identifying Common Files:

The bot starts by fetching the list of files from two specified repositories.
It then identifies files with common names, specifically those ending with .md, and stores them in a collection named commonFiles.

### Commit History Analysis:

The focus shifts to the commit history of these common files.
A filtering mechanism is applied to obtain commits from the original file that occurred after the last commit of the translation file.

### Issue Management:

If no issues are found, a new issue is automatically opened to highlight the need for updates as shown below.

![](https://github.com/huseyingulec/filgoBot/assets/107408663/53fd5b7e-03c5-4a9f-b8d7-ed30727fd87b)

If an issue already exists, the tool compares the SHA number of the commit in the existing issue with the latest received commit.

If the SHA numbers match, no action is taken as the issue is already up-to-date.

If the SHA numbers differ, a comment is added to the existing issue, notifying users of the new commit as shown below.

![](https://github.com/huseyingulec/filgoBot/assets/107408663/46e0c6bb-d6bc-46de-86a7-911a9ab74095)

## Usage

### Running the bot automatically with gitHub actions workflow 

Fork this repository

Open the repository on the GitHub website.
Create a Personal Access Token: Go to "Settings" > "Developer settings" > "Personal access tokens" on GitHub. Generate a new token with the repo scope and copy it. 

You will need to create a personal access token with the following permissions: 

- ``public_repo`` or repo (for private repositories): This is needed to fetch the list of files, fetch the commit history, and create issues.
- ``read:discussion``: This is needed to fetch the list of issues and comments.
- ``write:discussion``: This is needed to create comments on existing issues.

Add the Personal Access Token as a Repository Secret:

In your GitHub repository, go to "Settings" > "Secrets" > "New repository secret."
Name the secret ACCESS_TOKEN and paste the personal access token as the value.

Modify the Configuration in the Workflow File:

Open the .github/workflows/main.yml file in your repository. Change the following constants to match your repository and requirements:

``filesToIgnore``: Files to ignore while comparing the files in the two repositories. For example, if you want to ignore the README.md file, add README.md to the list. You can add multiple files to the list.

``translatedOwner``: GitHub repository 1 owner github username.

``translatedRepo``: GitHub repository 1 name.

``translatedBranch``: GitHub repository 1 branch name.

``translatedSubdirectory``: GitHub repository 1 subdirectory name if exists.

``originalOwner``: GitHub repository 2 owner github username.

``originalRepo``: GitHub repository 2 name.

``originalBranch``: GitHub repository 2 branch name.

``originalSubdirectory``: GitHub repository 2 subdirectory name if exists.

``issueLabel``: Label to be added to the issues created by the bot.

Once the changes are pushed to the yml file, the GitHub Actions workflow will be triggered automatically in every 12 hours(if you want, you can change it or trigger it manually).

To see, go to your GitHub repository and click on the "Actions" tab. You will see a list of all the workflows that have been run. Each workflow run is associated with a commit and the status of the run (success, failure, in progress) is displayed. Click on a workflow run to see more details. You can see the output of each step in the workflow, including any console logs from your script.
If the workflow fails, an error message will be displayed in the step that failed.


### Running the code locally:

First of all, ensure the necessary credentials and permissions are set up for both repositories.

Pull the repository to your local machine. ```git clone https://github.com/huseyingulec/filgoBot.git```

Install setups and dependencies ```npm install```

#### Configuration

Modify the bot.js file with the following parameters:

```ACCESS_TOKEN```: Access token for authentication.

You will need to create a personal access token with the following permissions: 
- ``public_repo`` or repo (for private repositories): This is needed to fetch the list of files, fetch the commit history, and create issues.
- ``read:discussion``: This is needed to fetch the list of issues and comments.
- ``write:discussion``: This is needed to create comments on existing issues.

``filesToIgnore``: Files to ignore while comparing the files in the two repositories. For example, if you want to ignore the README.md file, add README.md to the list. You can add multiple files to the list.

``translatedOwner``: GitHub repository 1 owner github username.

``translatedRepo``: GitHub repository 1 name.

``translatedBranch``: GitHub repository 1 branch name.

``translatedSubdirectory``: GitHub repository 1 subdirectory name if exists.

``originalOwner``: GitHub repository 2 owner github username.

``originalRepo``: GitHub repository 2 name.

``originalBranch``: GitHub repository 2 branch name.

``originalSubdirectory``: GitHub repository 2 subdirectory name if exists.

``issueLabel``: Label to be added to the issues created by the bot.

#### Run the bot ```node bot.js```

### License

This project is licensed under the [MIT License](LICENSE.md).

# Detailed Overview

## Project Purpose
The filgoBot is designed to facilitate the synchronization of markdown files between an original repository(Odin) and a translated repository(Kampus) on GitHub. It aims to identify new commits made to markdown files in the original repository and prompt updates in the translated repository. This synchronization is crucial for maintaining accurate and up-to-date translations.

## Components and Interactions
The key components in the codebase include:
1. **GitHub API Integration**: Utilizes the Octokit library to interact with the GitHub API for repository, commit and issue information.

2. **File Comparison**: Identifies common markdown files between the original and translated repositories.

3. **Commit Analysis**: Checks for new commits in the original repository for a specific file and filters out older commits and already resolved commits in closed issues. For example, if a commit is made in the original repository on 5th September at 10:00 am, and the latest commit in the translated repository for the same file is on 4th September, filgoBot will open an issue to prompt this new commit.

4. **Issue Management**: Creates or comments GitHub issues in the translated repository for a specific file to prompt file updates.

## Workflow Explanation

### Authentication
The codebase authenticates with GitHub using a provided access token (`process.env.ACCESS_TOKEN`).

### Configuration
The repositories, subdirectories, branches, and labels are configured using environment variables (`process.env`).

### File Retrieval
**`getFilesArray` Function**: Fetches the list of files in both original and translated repositories.

### File Comparison
The `getCommonFiles` function identifies markdown files common to both repositories, excluding specified files (e.g., `readme.md`, `licence.md`).

### Commit Analysis
1. **`processCommonFiles` Function**: Processes common files with a file-based loop to check for new commits.

2. **`getLastCommitDate` Function**: Retrieves the date of the last commit for a file in a repository.

3. **`isCommitInClosedIssues` Function**: Checks if a commit is already resolved in closed GitHub issues. In some commits in the original repo, they are fixing some typos in which we have already fixed while translating so we don't have push a new commit but if we didn't push a new commit, bot was going to open a new issue all the time. To fix this problem, I hid a unique key in the issue text that I created with {commit.sha}:{filePath}, so if in any closed issue includes this key, this commit will be excluded.

### Issue Management
1. **`createIssue` Function**: Creates or comments GitHub issues for translation updates for a specific file.

2. **`getExistingIssue` Function**: Retrieves an existing issue for a file in the translated repository. If none exists, pass to `createNewIssue`.

3. **`filterNewCommits` Function**: Filters out commits that were already commented on in an existing issue.

4. **`addCommentToIssue` Function**: Adds comments to an existing issue detailing new commits.

5. **`createNewIssue` Function**: Creates a new issue in the translated repository with details on updates.

This codebase ensures that translated markdown files are updated promptly based on new commits in the original repository, facilitating efficient maintenance of translated content.