import fs from 'fs';
import JSZip from 'jszip';

const filePath = 'public/election_data.csv.zip';
try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    console.log(Object.keys(zip.files));
} catch (err) {
    console.error("Error reading zip file:", err);
}
