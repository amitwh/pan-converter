# Push Instructions for Pan Converter

## Prerequisites
1. Create a new repository on GitHub: https://github.com/new
   - Repository name: `pan-converter`
   - Keep it empty (no README, .gitignore, or license)
   - Make it public or private as desired

2. Set up authentication:
   - **Option A - SSH Key** (Recommended):
     ```bash
     # Check if you have SSH key
     ls -la ~/.ssh/id_rsa.pub
     
     # If not, generate one:
     ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
     
     # Add to GitHub: Settings > SSH and GPG keys > New SSH key
     cat ~/.ssh/id_rsa.pub
     ```
   
   - **Option B - Personal Access Token**:
     - Go to GitHub Settings > Developer settings > Personal access tokens
     - Generate new token with 'repo' scope
     - Save the token securely

## Push Commands

### Using SSH (Recommended)
```bash
# Set SSH remote
git remote set-url origin git@github.com:amitwh/pan-converter.git

# Push all branches
git push -u origin master
git push origin linux
git push origin macos
git push origin windows
```

### Using HTTPS with Token
```bash
# Set HTTPS remote
git remote set-url origin https://github.com/amitwh/pan-converter.git

# Push all branches (you'll be prompted for username and token)
git push -u origin master
git push origin linux
git push origin macos
git push origin windows

# When prompted:
# Username: amitwh
# Password: [paste your Personal Access Token]
```

### Using GitHub CLI (if installed)
```bash
# Login to GitHub CLI
gh auth login

# Create repo and push
gh repo create pan-converter --public --source=. --remote=origin --push
```

## Automated Script
```bash
# Run the provided script
./push-to-github.sh
```

## Verify Success
After pushing, verify at: https://github.com/amitwh/pan-converter

You should see:
- 4 branches (master, linux, macos, windows)
- All project files
- Complete commit history

## Troubleshooting

### Authentication Failed
- For SSH: Ensure your SSH key is added to GitHub
- For HTTPS: Use Personal Access Token, not password
- Check token has 'repo' scope

### Repository Not Found
- Ensure repository exists on GitHub
- Check spelling: `pan-converter`
- Verify you're logged into the correct GitHub account

### Permission Denied
- Check repository ownership
- Ensure you have write access
- Verify authentication method is correct