/**
 * Word Template Exporter
 * Converts Markdown to DOCX using custom Word templates
 * Based on Template_exporter functionality
 */

const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');
const fs = require('fs');
const path = require('path');

class WordTemplateExporter {
    constructor() {
        this.inCodeBlock = false;
        this.inList = false;
        this.listType = null;
    }

    /**
     * Convert markdown to Word document with template
     * @param {string} markdownContent - The markdown content to convert
     * @param {string} outputPath - Where to save the DOCX file
     * @param {string} templatePath - Optional template path (for future implementation)
     */
    async convert(markdownContent, outputPath, templatePath = null) {
        // Parse markdown and create document elements
        const children = this.parseMarkdown(markdownContent);

        const doc = new Document({
            numbering: {
                config: [
                    {
                        reference: 'numbering',
                        levels: [
                            {
                                level: 0,
                                format: 'decimal',
                                text: '%1.',
                                alignment: AlignmentType.LEFT
                            }
                        ]
                    },
                    {
                        reference: 'bullets',
                        levels: [
                            {
                                level: 0,
                                format: 'bullet',
                                text: '\u2022',
                                alignment: AlignmentType.LEFT
                            }
                        ]
                    }
                ]
            },
            sections: [{
                properties: {},
                children: children
            }]
        });

        // Write to file
        const buffer = await Packer.toBuffer(doc);
        fs.writeFileSync(outputPath, buffer);

        return outputPath;
    }

    parseMarkdown(content) {
        const lines = content.split('\n');
        const elements = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Skip empty lines
            if (!line.trim()) {
                elements.push(new Paragraph({ text: '' }));
                i++;
                continue;
            }

            // Code blocks
            if (line.trim().startsWith('```')) {
                const codeLines = [];
                i++;
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                elements.push(this.createCodeBlock(codeLines.join('\n')));
                i++;
                continue;
            }

            // Headers
            if (line.trim().startsWith('#')) {
                elements.push(this.createHeading(line));
                i++;
                continue;
            }

            // Blockquotes
            if (line.trim().startsWith('>')) {
                elements.push(this.createQuote(line));
                i++;
                continue;
            }

            // Ordered lists
            if (/^\s*\d+\.\s+/.test(line)) {
                elements.push(this.createListItem(line, true));
                i++;
                continue;
            }

            // Unordered lists
            if (/^\s*[-*+]\s+/.test(line)) {
                elements.push(this.createListItem(line, false));
                i++;
                continue;
            }

            // Horizontal rule
            if (/^[-*_]{3,}$/.test(line.trim())) {
                elements.push(this.createHorizontalRule());
                i++;
                continue;
            }

            // Tables
            if (line.includes('|')) {
                const tableLines = [line];
                i++;
                while (i < lines.length && lines[i].includes('|')) {
                    tableLines.push(lines[i]);
                    i++;
                }
                const table = this.createTable(tableLines);
                if (table) elements.push(table);
                continue;
            }

            // Normal paragraph
            elements.push(this.createParagraph(line));
            i++;
        }

        return elements;
    }

    createHeading(line) {
        const level = line.match(/^#+/)[0].length;
        const text = line.replace(/^#+\s*/, '').trim();

        const headingLevels = {
            1: HeadingLevel.HEADING_1,
            2: HeadingLevel.HEADING_2,
            3: HeadingLevel.HEADING_3,
            4: HeadingLevel.HEADING_4,
            5: HeadingLevel.HEADING_5,
            6: HeadingLevel.HEADING_6
        };

        return new Paragraph({
            text: text,
            heading: headingLevels[Math.min(level, 6)]
        });
    }

    createParagraph(line) {
        const runs = this.parseInlineFormatting(line);
        return new Paragraph({ children: runs });
    }

    createQuote(line) {
        const text = line.replace(/^>\s*/, '').trim();
        const runs = this.parseInlineFormatting(text);

        return new Paragraph({
            children: runs,
            indent: { left: 720 }, // 0.5 inch indent
            italics: true
        });
    }

    createListItem(line, numbered) {
        const text = line.replace(/^\s*(\d+\.|-|\*|\+)\s+/, '').trim();
        const runs = this.parseInlineFormatting(text);

        return new Paragraph({
            children: runs,
            numbering: {
                reference: numbered ? 'numbering' : 'bullets',
                level: 0
            }
        });
    }

    createCodeBlock(code) {
        return new Paragraph({
            children: [
                new TextRun({
                    text: code,
                    font: 'Consolas',
                    size: 18 // 9pt
                })
            ],
            shading: {
                fill: 'F5F5F5'
            }
        });
    }

    createHorizontalRule() {
        return new Paragraph({
            text: '_'.repeat(50),
            alignment: AlignmentType.CENTER
        });
    }

    createTable(tableLines) {
        // Skip separator lines
        const rows = tableLines.filter(line => !line.match(/^\s*\|[\s\-:]+\|\s*$/));

        if (rows.length === 0) return null;

        const tableRows = rows.map((line, index) => {
            const cells = line.split('|').filter(cell => cell.trim()).map(cell => cell.trim());

            return new TableRow({
                children: cells.map(cellText => {
                    const runs = this.parseInlineFormatting(cellText);
                    return new TableCell({
                        children: [new Paragraph({ children: runs })],
                        shading: index === 0 ? { fill: 'E7E6E6' } : undefined,
                        width: { size: 100 / cells.length, type: WidthType.PERCENTAGE }
                    });
                })
            });
        });

        return new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE }
        });
    }

    parseInlineFormatting(text) {
        const runs = [];
        let pos = 0;

        // Patterns for inline formatting
        const patterns = [
            { regex: /\*\*\*(.+?)\*\*\*/g, bold: true, italics: true },
            { regex: /\*\*(.+?)\*\*/g, bold: true },
            { regex: /\*(.+?)\*/g, italics: true },
            { regex: /`(.+?)`/g, code: true },
            { regex: /\[([^\]]+)\]\(([^\)]+)\)/g, link: true }
        ];

        // Simple implementation: find all matches and create runs
        let segments = [{ text: text, format: {} }];

        for (const pattern of patterns) {
            const newSegments = [];

            for (const segment of segments) {
                if (segment.format.processed) {
                    newSegments.push(segment);
                    continue;
                }

                let lastIndex = 0;
                const matches = [...segment.text.matchAll(pattern.regex)];

                if (matches.length === 0) {
                    newSegments.push(segment);
                    continue;
                }

                matches.forEach(match => {
                    // Add text before match
                    if (match.index > lastIndex) {
                        newSegments.push({
                            text: segment.text.substring(lastIndex, match.index),
                            format: segment.format
                        });
                    }

                    // Add formatted text
                    const format = { ...segment.format, processed: true };
                    if (pattern.bold) format.bold = true;
                    if (pattern.italics) format.italics = true;
                    if (pattern.code) {
                        format.font = 'Consolas';
                        format.size = 20;
                    }

                    newSegments.push({
                        text: match[1],
                        format: format
                    });

                    lastIndex = match.index + match[0].length;
                });

                // Add remaining text
                if (lastIndex < segment.text.length) {
                    newSegments.push({
                        text: segment.text.substring(lastIndex),
                        format: segment.format
                    });
                }
            }

            segments = newSegments;
        }

        // Convert segments to TextRun objects
        return segments.map(seg => new TextRun({
            text: seg.text,
            bold: seg.format.bold,
            italics: seg.format.italics,
            font: seg.format.font,
            size: seg.format.size
        }));
    }
}

module.exports = WordTemplateExporter;
