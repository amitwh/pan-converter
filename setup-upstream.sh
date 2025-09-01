#!/bin/bash

# Pan Converter - Git Remote Setup Script
# 
# Instructions:
# 1. Create a new repository on GitHub named "pan-converter"
# 2. Replace YOUR_GITHUB_USERNAME with your actual GitHub username
# 3. Run this script: bash setup-upstream.sh

GITHUB_USERNAME="amitwh"
REPO_NAME="pan-converter"

echo "Setting up remote repository..."

# Add remote origin
git remote add origin "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"

echo "Pushing all branches to remote..."

# Push master branch
git push -u origin master

# Push platform-specific branches
git push origin linux
git push origin macos  
git push origin windows

echo "Repository setup complete!"
echo ""
echo "Your repository is now available at:"
echo "https://github.com/$GITHUB_USERNAME/$REPO_NAME"
echo ""
echo "Branch structure:"
echo "  - master (main development)"
echo "  - linux (Linux-specific)"
echo "  - macos (macOS-specific)"
echo "  - windows (Windows-specific)"
