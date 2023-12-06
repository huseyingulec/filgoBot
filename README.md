# filgoBot

This bot facilitates the updating of two GitHub repositories by identifying common Markdown files and managing their commit histories. It streamlines the process of tracking changes between original and translated files, automating the creation of issues for updates.

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

``owner``: GitHub repository 1 owner github username.

``repo``: GitHub repository 1 name.

``branch``: GitHub repository 1 branch name.

``originalOwner``: GitHub repository 2 owner github username.

``originalRepo``: GitHub repository 2 name.

``originalBranch``: GitHub repository 2 branch name.

Once the changes are pushed to the yml file, the GitHub Actions workflow will be triggered automatically in every 12 hours(if you want, you can change it or trigger it manually).

To see, go to your GitHub repository and click on the "Actions" tab. You will see a list of all the workflows that have been run. Each workflow run is associated with a commit and the status of the run (success, failure, in progress) is displayed. Click on a workflow run to see more details. You can see the output of each step in the workflow, including any console logs from your script.
If the workflow fails, an error message will be displayed in the step that failed.


### Running the code locally:

First of all, ensure the necessary credentials and permissions are set up for both repositories.

Pull the repository to your local machine. ```git clone https://github.com/huseyingulec/filgoBot.git```

Install setups and dependencies ```npm install -y```

#### Configuration

Modify the bot.js file with the following parameters:

```ACCESS_TOKEN```: Access token for authentication.

You will need to create a personal access token with the following permissions: 
- ``public_repo`` or repo (for private repositories): This is needed to fetch the list of files, fetch the commit history, and create issues.
- ``read:discussion``: This is needed to fetch the list of issues and comments.
- ``write:discussion``: This is needed to create comments on existing issues.

``filesToIgnore``: Files to ignore while comparing the files in the two repositories. For example, if you want to ignore the README.md file, add README.md to the list. You can add multiple files to the list.

``owner``: GitHub repository 1 owner github username.

``repo``: GitHub repository 1 name.

``branch``: GitHub repository 1 branch name.

``originalOwner``: GitHub repository 2 owner github username.

``originalRepo``: GitHub repository 2 name.

``originalBranch``: GitHub repository 2 branch name.

#### Run the bot ```node bot.js```

### License

This project is licensed under the [MIT License](LICENSE.md).

