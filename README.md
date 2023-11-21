## filgoBot

This bot facilitates the updating of two GitHub repositories by identifying common Markdown files and managing their commit histories. It streamlines the process of tracking changes between original and translated files, automating the creation of issues for updates.

### How It Works

#### Identifying Common Files:

The bot starts by fetching the list of files from two specified repositories.
It then identifies files with common names, specifically those ending with .md, and stores them in a collection named commonFiles.

#### Commit History Analysis:

The focus shifts to the commit history of these common files.
A filtering mechanism is applied to obtain commits from the original file that occurred after the last commit of the translation file.

#### Issue Management:

If no issues are found, a new issue is automatically opened to highlight the need for updates as shown below.

![](images/filgo-issue.png)

If an issue already exists, the tool compares the SHA number of the commit in the existing issue with the latest received commit.

If the SHA numbers match, no action is taken as the issue is already up-to-date.

If the SHA numbers differ, a comment is added to the existing issue, notifying users of the new commit as shown below.

![](images/filgo-comment.png)

### Usage

#### Setup:

Ensure the necessary credentials and permissions are set up for both repositories.

Pull the repository to your local machine. ```git clone https://github.com/huseyingulec/filgoBot.git```

Install setups and dependencies ```npm install -y```

#### Configuration

Modify the bot.js file with the following parameters:

```ACCESS_TOKEN```: Access token for authentication.

You will need to create a personal access token with the following permissions: 
- ``public_repo`` or repo (for private repositories): This is needed to fetch the list of files, fetch the commit history, and create issues.
- ``read:discussion``: This is needed to fetch the list of issues and comments.
- ``write:discussion``: This is needed to create comments on existing issues.

``owner``: GitHub repository 1 owner github username.

``repo``: GitHub repository 1 name.

``branch``: GitHub repository 1 branch name.

``originalOwner``: GitHub repository 2 owner github username.

``originalRepo``: GitHub repository 2 name.

``originalBranch``: GitHub repository 2 branch name.

#### Run the bot ```node bot.js```

### License

This project is licensed under the [MIT License](LICENSE.md).
