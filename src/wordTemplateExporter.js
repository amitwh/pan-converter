/**
 * Word Template Exporter
 * Loads word_template.docx, preserves first 2 pages (cover + TOC),
 * and adds markdown content starting from page 3 using template styles
 */

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docx = require('docx4js').default;

class WordTemplateExporter {
    constructor(templatePath, startPage = 3) {
        this.templatePath = templatePath || path.join(__dirname, '../word_template.docx');
        this.startPage = startPage; // Which page to start inserting content
    }

    /**
     * Convert markdown to Word document using template
     */
    async convert(markdownContent, outputPath) {
        try {
            // Load template
            const templateBuffer = fs.readFileSync(this.templatePath);
            const zip = new PizZip(templateBuffer);

            // Extract document.xml
            const documentXml = zip.file('word/document.xml').asText();

            // Parse markdown and generate Word XML
            const newContentXml = this.markdownToWordXml(markdownContent);

            // Insert new content after the specified start page
            const modifiedXml = this.insertContentAfterPage(documentXml, newContentXml, this.startPage);

            // Update the zip with modified XML
            zip.file('word/document.xml', modifiedXml);

            // Generate and save the new document
            const newDocBuffer = zip.generate({ type: 'nodebuffer' });
            fs.writeFileSync(outputPath, newDocBuffer);

            return outputPath;
        } catch (error) {
            console.error('Error in Word export:', error);
            throw error;
        }
    }

    /**
     * Insert markdown content after the specified page in the document
     * @param {string} documentXml - The document XML
     * @param {string} newContentXml - The new content to insert
     * @param {number} afterPage - Insert content after this page number (1-based)
     */
    insertContentAfterPage(documentXml, newContentXml, afterPage) {
        // Find section breaks that mark page boundaries
        // Look for the section properties tag that marks page breaks
        const sectionBreakRegex = /<w:sectPr[^>]*>[\s\S]*?<\/w:sectPr>/g;
        const matches = [...documentXml.matchAll(sectionBreakRegex)];

        // Calculate which section break to insert after
        // Page 1 = before 1st section break
        // Page 2 = after 1st section break
        // Page 3 = after 2nd section break, etc.
        const sectionIndex = afterPage - 1;

        if (matches.length >= sectionIndex && sectionIndex > 0) {
            // Insert after the specified section break
            const insertPoint = matches[sectionIndex - 1].index + matches[sectionIndex - 1][0].length;
            return documentXml.slice(0, insertPoint) + newContentXml + documentXml.slice(insertPoint);
        } else if (afterPage === 1 || matches.length === 0) {
            // Insert at the beginning (after <w:body>) or if no section breaks found
            const bodyStart = documentXml.indexOf('<w:body>') + 8;
            return documentXml.slice(0, bodyStart) + newContentXml + documentXml.slice(bodyStart);
        } else {
            // If not enough section breaks, insert before closing body tag
            return documentXml.replace('</w:body>', newContentXml + '</w:body>');
        }
    }

    /**
     * Convert markdown to Word XML format
     */
    markdownToWordXml(markdown) {
        const lines = markdown.split('\n');
        let xml = '';
        let inCodeBlock = false;
        let codeLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Handle code blocks
            if (line.trim().startsWith('```')) {
                if (inCodeBlock) {
                    // End code block
                    xml += this.createCodeBlockXml(codeLines.join('\n'));
                    codeLines = [];
                    inCodeBlock = false;
                } else {
                    inCodeBlock = true;
                }
                continue;
            }

            if (inCodeBlock) {
                codeLines.push(line);
                continue;
            }

            // Empty lines
            if (!line.trim()) {
                xml += '<w:p><w:pPr></w:pPr></w:p>';
                continue;
            }

            // Tables - detect table lines
            if (line.includes('|') && line.trim().startsWith('|')) {
                const tableLines = [line];
                i++;
                // Collect all consecutive table lines
                while (i < lines.length && lines[i].includes('|')) {
                    tableLines.push(lines[i]);
                    i++;
                }
                i--; // Back up one line
                xml += this.createTableXml(tableLines);
                continue;
            }

            // ASCII flowcharts/diagrams - detect box drawing characters
            if (this.isAsciiArt(line)) {
                const asciiLines = [line];
                i++;
                // Collect all consecutive ASCII art lines
                while (i < lines.length && (this.isAsciiArt(lines[i]) || !lines[i].trim())) {
                    asciiLines.push(lines[i]);
                    i++;
                    if (i < lines.length && lines[i].trim() && !this.isAsciiArt(lines[i])) {
                        break;
                    }
                }
                i--; // Back up one line
                xml += this.createAsciiArtXml(asciiLines.join('\n'));
                continue;
            }

            // Headings - strip markdown numbering
            if (line.trim().startsWith('#')) {
                const level = (line.match(/^#+/) || [''])[0].length;
                let text = line.replace(/^#+\s*/, '').trim();
                // Remove markdown numbering like "1.1 Title" -> "Title"
                text = text.replace(/^\d+(\.\d+)*\.?\s+/, '');
                xml += this.createHeadingXml(text, level);
                continue;
            }

            // Blockquotes
            if (line.trim().startsWith('>')) {
                const text = line.replace(/^>\s*/, '').trim();
                xml += this.createQuoteXml(text);
                continue;
            }

            // Ordered lists - strip markdown numbering, use template numbering
            if (/^\s*\d+\.\s+/.test(line)) {
                const text = line.replace(/^\s*\d+\.\s+/, '');
                xml += this.createListItemXml(text, true);
                continue;
            }

            // Unordered lists
            if (/^\s*[-*+]\s+/.test(line)) {
                const text = line.replace(/^\s*[-*+]\s+/, '');
                xml += this.createListItemXml(text, false);
                continue;
            }

            // Horizontal rule
            if (/^[-*_]{3,}$/.test(line.trim())) {
                xml += this.createHorizontalRuleXml();
                continue;
            }

            // Normal paragraph
            xml += this.createParagraphXml(line);
        }

        return xml;
    }

    /**
     * Create heading XML using template styles
     */
    createHeadingXml(text, level) {
        const styleName = `Heading${level}`;
        const runs = this.parseInlineFormatting(text);

        return `<w:p>
            <w:pPr>
                <w:pStyle w:val="${styleName}"/>
            </w:pPr>
            ${runs}
        </w:p>`;
    }

    /**
     * Create paragraph XML with Normal style
     */
    createParagraphXml(text) {
        const runs = this.parseInlineFormatting(text);

        return `<w:p>
            <w:pPr>
                <w:pStyle w:val="Normal"/>
            </w:pPr>
            ${runs}
        </w:p>`;
    }

    /**
     * Create quote XML
     */
    createQuoteXml(text) {
        const runs = this.parseInlineFormatting(text);

        return `<w:p>
            <w:pPr>
                <w:pStyle w:val="Quote"/>
            </w:pPr>
            ${runs}
        </w:p>`;
    }

    /**
     * Create list item XML using template numbering
     */
    createListItemXml(text, numbered) {
        const runs = this.parseInlineFormatting(text);
        const numId = numbered ? '1' : '2'; // Template numbering IDs

        return `<w:p>
            <w:pPr>
                <w:pStyle w:val="${numbered ? 'ListNumber' : 'ListBullet'}"/>
                <w:numPr>
                    <w:ilvl w:val="0"/>
                    <w:numId w:val="${numId}"/>
                </w:numPr>
            </w:pPr>
            ${runs}
        </w:p>`;
    }

    /**
     * Create code block XML
     */
    createCodeBlockXml(code) {
        const escapedCode = this.escapeXml(code);

        return `<w:p>
            <w:pPr>
                <w:pStyle w:val="Code"/>
            </w:pPr>
            <w:r>
                <w:rPr>
                    <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
                    <w:sz w:val="18"/>
                </w:rPr>
                <w:t xml:space="preserve">${escapedCode}</w:t>
            </w:r>
        </w:p>`;
    }

    /**
     * Create horizontal rule XML
     */
    createHorizontalRuleXml() {
        return `<w:p>
            <w:pPr>
                <w:pBdr>
                    <w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/>
                </w:pBdr>
            </w:pPr>
        </w:p>`;
    }

    /**
     * Create table XML from markdown table lines with template styling
     */
    createTableXml(tableLines) {
        // Parse table
        const rows = [];
        for (const line of tableLines) {
            // Skip separator lines (e.g., |---|---|)
            if (/^\s*\|[\s\-:]+\|\s*$/.test(line)) {
                continue;
            }
            // Split by | and trim
            const cells = line.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        if (rows.length === 0) return '';

        // Calculate number of columns
        const numCols = Math.max(...rows.map(row => row.length));

        // Build table XML
        let tableXml = '<w:tbl>';

        // Table properties - use template table style
        tableXml += `<w:tblPr>
            <w:tblStyle w:val="TableGrid"/>
            <w:tblW w:w="5000" w:type="pct"/>
            <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
            <w:tblBorders>
                <w:top w:val="single" w:sz="8" w:space="0" w:color="F58220"/>
                <w:left w:val="single" w:sz="8" w:space="0" w:color="F58220"/>
                <w:bottom w:val="single" w:sz="8" w:space="0" w:color="F58220"/>
                <w:right w:val="single" w:sz="8" w:space="0" w:color="F58220"/>
                <w:insideH w:val="single" w:sz="8" w:space="0" w:color="F58220"/>
                <w:insideV w:val="single" w:sz="8" w:space="0" w:color="F58220"/>
            </w:tblBorders>
        </w:tblPr>`;

        // Table grid
        tableXml += '<w:tblGrid>';
        for (let i = 0; i < numCols; i++) {
            tableXml += '<w:gridCol/>';
        }
        tableXml += '</w:tblGrid>';

        // Table rows
        rows.forEach((rowCells, rowIndex) => {
            const isHeader = rowIndex === 0;
            const isEvenRow = rowIndex % 2 === 0;

            tableXml += '<w:tr>';

            // Pad row to have same number of columns
            while (rowCells.length < numCols) {
                rowCells.push('');
            }

            rowCells.forEach((cellText, colIndex) => {
                tableXml += '<w:tc>';
                tableXml += '<w:tcPr>';

                // Cell shading - orange for header, white for data rows
                if (isHeader) {
                    tableXml += '<w:shd w:val="clear" w:color="FFFFFF" w:fill="F58220"/>';
                }

                // Cell borders
                tableXml += '<w:tcBorders>' +
                    '<w:top w:val="single" w:sz="8" w:space="0" w:color="F58220"/>' +
                    '<w:left w:val="single" w:sz="8" w:space="0" w:color="F58220"/>' +
                    '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="F58220"/>' +
                    '<w:right w:val="single" w:sz="8" w:space="0" w:color="F58220"/>' +
                    '</w:tcBorders>';
                tableXml += '</w:tcPr>';

                // Cell content
                tableXml += '<w:p>';
                tableXml += '<w:pPr>';
                tableXml += '<w:spacing w:before="100" w:after="100"/>';
                tableXml += '</w:pPr>';

                const runs = this.parseInlineFormatting(cellText);

                if (isHeader) {
                    // Header: bold white text
                    tableXml += runs.replace(/<w:rPr>/g, '<w:rPr><w:b/><w:color w:val="FFFFFF"/>');
                } else {
                    // Data rows: normal black text
                    tableXml += runs;
                }

                tableXml += '</w:p>';
                tableXml += '</w:tc>';
            });

            tableXml += '</w:tr>';
        });

        tableXml += '</w:tbl>';

        return tableXml;
    }

    /**
     * Detect if line contains ASCII art/flowchart characters
     */
    isAsciiArt(line) {
        // Don't treat markdown tables as ASCII art
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            return false;
        }

        // Common ASCII art characters
        const asciiArtChars = [
            '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',  // Box drawing
            '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',  // Double box
            '▲', '▼', '◄', '►', '♦', '●', '○', '■', '□',             // Shapes
            '↓', '→', '←', '↑',                                      // Arrows
        ];

        // Check for box drawing characters
        if (asciiArtChars.some(char => line.includes(char))) {
            return true;
        }

        // Check for ASCII box patterns with regular characters
        const asciiPatterns = [
            /^\s*\+[-=_]+\+/,                    // +-----+
            /^\s*\|[-=_]{3,}\|/,                 // |-----|
            /^\s*[-=_]{5,}$/,                    // -----
            /^\s*\([A-Z][a-z]+\)\s*\|\|/,       // (Deformable) ||
            /^\s*\|\s+[A-Z\s]+[-:]\s+[A-Z]/,    // | TILE ADHESIVE - TYPE
            /^\s*\|\s*\[[^\]]+\]/,              // | [BIS Mark / CE Mark]
            /^\s*\|\s{2,}\w+.*\|\|/,            // ||  text  ||
            /^\s*\[[^\]]+\]/,                   // [Step in brackets]
        ];

        return asciiPatterns.some(pattern => pattern.test(line));
    }

    /**
     * Create ASCII art XML with monospace font
     */
    createAsciiArtXml(asciiContent) {
        // Split ASCII art into individual lines and create a paragraph for each
        const lines = asciiContent.split('\n');
        let xml = '';

        lines.forEach((line, index) => {
            xml += `<w:p>
                <w:pPr>
                    <w:spacing w:before="${index === 0 ? '120' : '0'}" w:after="${index === lines.length - 1 ? '120' : '0'}" w:line="240" w:lineRule="exact"/>
                    <w:ind w:left="0" w:right="0"/>
                    <w:jc w:val="left"/>
                    <w:keepLines/>
                    <w:wordWrap w:val="0"/>
                </w:pPr>`;

            // Check if line contains arrow characters and color them red
            const arrowChars = ['↓', '→', '←', '↑', '▼', '►', '◄', '▲'];
            const hasArrow = arrowChars.some(arrow => line.includes(arrow));

            if (hasArrow) {
                // Split line into parts and color arrows red
                let remainingLine = line;
                let processedText = '';

                while (remainingLine.length > 0) {
                    let foundArrow = false;
                    let arrowIndex = -1;
                    let foundArrowChar = '';

                    // Find the first arrow in the remaining text
                    for (const arrow of arrowChars) {
                        const idx = remainingLine.indexOf(arrow);
                        if (idx !== -1 && (arrowIndex === -1 || idx < arrowIndex)) {
                            arrowIndex = idx;
                            foundArrowChar = arrow;
                            foundArrow = true;
                        }
                    }

                    if (foundArrow) {
                        // Add text before arrow (if any)
                        if (arrowIndex > 0) {
                            const beforeArrow = this.escapeXml(remainingLine.substring(0, arrowIndex));
                            xml += `<w:r>
                                <w:rPr>
                                    <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
                                    <w:sz w:val="16"/>
                                    <w:szCs w:val="16"/>
                                    <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
                                    <w:noProof/>
                                </w:rPr>
                                <w:t xml:space="preserve">${beforeArrow}</w:t>
                            </w:r>`;
                        }

                        // Add arrow in red
                        const escapedArrow = this.escapeXml(foundArrowChar);
                        xml += `<w:r>
                            <w:rPr>
                                <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
                                <w:sz w:val="16"/>
                                <w:szCs w:val="16"/>
                                <w:color w:val="FF0000"/>
                                <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
                                <w:noProof/>
                            </w:rPr>
                            <w:t xml:space="preserve">${escapedArrow}</w:t>
                        </w:r>`;

                        // Continue with remaining text
                        remainingLine = remainingLine.substring(arrowIndex + foundArrowChar.length);
                    } else {
                        // No more arrows, add remaining text
                        const escapedRemaining = this.escapeXml(remainingLine);
                        xml += `<w:r>
                            <w:rPr>
                                <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
                                <w:sz w:val="16"/>
                                <w:szCs w:val="16"/>
                                <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
                                <w:noProof/>
                            </w:rPr>
                            <w:t xml:space="preserve">${escapedRemaining}</w:t>
                        </w:r>`;
                        remainingLine = '';
                    }
                }
            } else {
                // No arrows, just add the line normally
                const escapedLine = this.escapeXml(line);
                xml += `<w:r>
                    <w:rPr>
                        <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>
                        <w:sz w:val="16"/>
                        <w:szCs w:val="16"/>
                        <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
                        <w:noProof/>
                    </w:rPr>
                    <w:t xml:space="preserve">${escapedLine}</w:t>
                </w:r>`;
            }

            xml += `</w:p>`;
        });

        return xml;
    }

    /**
     * Parse inline formatting (bold, italic, code)
     */
    parseInlineFormatting(text) {
        let xml = '';
        let pos = 0;

        // Patterns for inline formatting
        const patterns = [
            { regex: /\*\*\*(.+?)\*\*\*/g, bold: true, italic: true },
            { regex: /\*\*(.+?)\*\*/g, bold: true },
            { regex: /\*(.+?)\*/g, italic: true },
            { regex: /`(.+?)`/g, code: true }
        ];

        // Simple approach: process text sequentially
        let remaining = text;

        while (remaining.length > 0) {
            let foundMatch = false;
            let earliestPos = remaining.length;
            let matchedPattern = null;
            let match = null;

            // Find earliest match
            for (const pattern of patterns) {
                pattern.regex.lastIndex = 0;
                const m = pattern.regex.exec(remaining);
                if (m && m.index < earliestPos) {
                    earliestPos = m.index;
                    matchedPattern = pattern;
                    match = m;
                    foundMatch = true;
                }
            }

            if (foundMatch) {
                // Add text before match
                if (earliestPos > 0) {
                    xml += this.createRunXml(remaining.substring(0, earliestPos));
                }

                // Add formatted text
                xml += this.createRunXml(match[1], matchedPattern.bold, matchedPattern.italic, matchedPattern.code);

                remaining = remaining.substring(earliestPos + match[0].length);
            } else {
                // No more matches, add remaining text
                xml += this.createRunXml(remaining);
                break;
            }
        }

        return xml;
    }

    /**
     * Create a run (text segment) XML
     */
    createRunXml(text, bold = false, italic = false, code = false) {
        if (!text) return '';

        const escapedText = this.escapeXml(text);
        let propsXml = '<w:rPr>';

        if (bold) propsXml += '<w:b/>';
        if (italic) propsXml += '<w:i/>';
        if (code) {
            propsXml += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>';
            propsXml += '<w:sz w:val="20"/>';
        }

        propsXml += '</w:rPr>';

        return `<w:r>${propsXml}<w:t xml:space="preserve">${escapedText}</w:t></w:r>`;
    }

    /**
     * Escape XML special characters
     */
    escapeXml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

module.exports = WordTemplateExporter;
