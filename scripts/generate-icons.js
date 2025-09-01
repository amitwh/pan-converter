const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = {
    'icon.png': 512,
    'icon@2x.png': 1024,
    'icon.ico': 256,
    'icon.icns': 512
};

const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
    for (const [filename, size] of Object.entries(sizes)) {
        const outputPath = path.join(__dirname, '..', 'assets', filename);
        
        if (filename.endsWith('.png')) {
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(outputPath);
            console.log(`Generated ${filename}`);
        } else if (filename.endsWith('.ico')) {
            // For ICO, we'll just use the PNG version
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(outputPath.replace('.ico', '.png'));
            console.log(`Generated ${filename.replace('.ico', '.png')} (use png2ico to convert)`);
        } else if (filename.endsWith('.icns')) {
            // For ICNS, we'll just use the PNG version
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(outputPath.replace('.icns', '.png'));
            console.log(`Generated ${filename.replace('.icns', '.png')} (use png2icns to convert)`);
        }
    }
}

generateIcons().catch(console.error);