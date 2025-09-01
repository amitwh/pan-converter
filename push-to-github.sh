#!/bin/bash

echo "=========================================="
echo "Pan Converter - GitHub Push Helper"
echo "=========================================="
echo ""
echo "Before running this script, please ensure:"
echo "1. You have created a repository named 'pan-converter' on GitHub"
echo "2. The repository is empty (no README, .gitignore, or license)"
echo "3. You have set up authentication (SSH key or Personal Access Token)"
echo ""
read -p "Have you completed the above steps? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please complete the setup first:"
    echo "1. Go to https://github.com/new"
    echo "2. Create a new repository named 'pan-converter'"
    echo "3. DO NOT initialize with README, .gitignore, or license"
    echo "4. Set up SSH key or Personal Access Token for authentication"
    exit 1
fi

echo ""
echo "Choose authentication method:"
echo "1. SSH (Recommended if you have SSH keys set up)"
echo "2. HTTPS (Requires Personal Access Token)"
read -p "Enter your choice (1 or 2): " AUTH_CHOICE

if [ "$AUTH_CHOICE" = "1" ]; then
    echo "Using SSH authentication..."
    git remote set-url origin git@github.com:amitwh/pan-converter.git
elif [ "$AUTH_CHOICE" = "2" ]; then
    echo "Using HTTPS authentication..."
    echo "You'll need to enter your GitHub username and Personal Access Token"
    git remote set-url origin https://github.com/amitwh/pan-converter.git
else
    echo "Invalid choice. Exiting."
    exit 1
fi

echo ""
echo "Pushing branches to GitHub..."
echo "=============================="

# Push master branch with upstream tracking
echo "Pushing master branch..."
if git push -u origin master; then
    echo "✓ Master branch pushed successfully"
else
    echo "✗ Failed to push master branch"
    echo "Please check your authentication and try again"
    exit 1
fi

# Push other branches
echo "Pushing linux branch..."
if git push origin linux; then
    echo "✓ Linux branch pushed successfully"
else
    echo "✗ Failed to push linux branch"
fi

echo "Pushing macos branch..."
if git push origin macos; then
    echo "✓ macOS branch pushed successfully"
else
    echo "✗ Failed to push macos branch"
fi

echo "Pushing windows branch..."
if git push origin windows; then
    echo "✓ Windows branch pushed successfully"
else
    echo "✗ Failed to push windows branch"
fi

echo ""
echo "=========================================="
echo "Push complete!"
echo "Your repository is available at:"
echo "https://github.com/amitwh/pan-converter"
echo "=========================================="