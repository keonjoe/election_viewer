import fs from 'fs/promises';
import JSZip from 'jszip';
import path from 'path';

const zipPath = 'public/election_data.csv.zip';
const fileNameInZip = 'election_data.csv';

async function readZip() {
    try {
        const buffer = await fs.readFile(zipPath);
        const zip = await JSZip.loadAsync(buffer);
        
        // Check if file exists, if not list contents
        if (!zip.file(fileNameInZip)) {
            console.error(`File '${fileNameInZip}' not found in zip.`);
            console.log("Files found in zip:", Object.keys(zip.files));
            
            // Try to find a csv file if the specific name isn't found
            const csvFile = Object.keys(zip.files).find(name => name.endsWith('.csv'));
            if (csvFile) {
                console.log(`Reading '${csvFile}' instead...`);
                const content = await zip.file(csvFile).async('string');
                printFirstLines(content);
            }
            return;
        }

        const content = await zip.file(fileNameInZip).async('string');
        printFirstLines(content);

    } catch (error) {
        console.error('Error reading zip:', error);
    }
}

function printFirstLines(content) {
    const lines = content.split('\n');
    console.log('First 5 lines:');
    for (let i = 0; i < 5 && i < lines.length; i++) {
        console.log(lines[i]);
    }
}

readZip();
