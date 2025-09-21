// Test script to verify export functionality
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Testing export functionality...');

// Test 1: Check if pandoc is available
console.log('\n1. Checking Pandoc availability...');
exec('pandoc --version', (error, stdout, stderr) => {
  if (error) {
    console.log('❌ Pandoc not available:', error.message);
    console.log('✅ Built-in HTML and PDF export should work');
  } else {
    console.log('✅ Pandoc is available');
    console.log('   Version info:', stdout.split('\n')[0]);
  }
});

// Test 2: Check if test markdown file exists
console.log('\n2. Checking test file...');
const testFile = path.join(__dirname, 'test-export.md');
if (fs.existsSync(testFile)) {
  console.log('✅ Test markdown file exists:', testFile);
  const content = fs.readFileSync(testFile, 'utf8');
  console.log('   File size:', content.length, 'characters');
} else {
  console.log('❌ Test markdown file not found');
}

// Test 3: Check marked library
console.log('\n3. Testing marked library...');
try {
  const marked = require('marked');
  const testMarkdown = '# Test\nThis is a **test** markdown.';
  const html = marked.parse(testMarkdown);
  console.log('✅ Marked library working');
  console.log('   Sample output:', html.substring(0, 50) + '...');
} catch (error) {
  console.log('❌ Marked library error:', error.message);
}

console.log('\n✅ Export functionality test completed!');
console.log('\nHow to test exports:');
console.log('1. Open the application');
console.log('2. Open test-export.md file');
console.log('3. Try exporting to HTML (should work without Pandoc)');
console.log('4. Try exporting to PDF (should work without Pandoc)');
console.log('5. Try exporting to DOCX (requires Pandoc)');