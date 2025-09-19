import fs from 'fs';
import csv from 'csv-parser';
import readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables from .env file
try {
    dotenv.config();
} catch (error) {
    console.error('Error loading .env file:', error.message);
    process.exit(1);
}

// Check if API key exists
if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment variables.');
    console.error('Please create a .env file with your OpenAI API key:');
    console.error('OPENAI_API_KEY=your_api_key_here');
    process.exit(1);
}

function loadCsv(filename) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filename)
            .pipe(csv())
            .on('data', (row) => {
                results.push(row);
            })
            .on('end', () => {
                resolve(results);
            })
            .on('error', reject);
    });
}

const assetData = await loadCsv('Asset_anonymized.csv');

// Function to slice data based on selected columns
function sliceDataByColumns(data, selectedColumns) {
    if (!selectedColumns || selectedColumns.length === 0) {
        console.log("No columns selected, returning all data");
        return data;
    }
    
    console.log(`Slicing data to include only columns: ${selectedColumns.join(', ')}`);
    
    return data.map(row => {
        const slicedRow = {};
        selectedColumns.forEach(column => {
            if (row.hasOwnProperty(column)) {
                slicedRow[column] = row[column];
            } else {
                console.warn(`Warning: Column "${column}" not found in data`);
            }
        });
        return slicedRow;
    });
}

// Function to display available columns and get user selection
async function getUserColumnSelection() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Get all available columns from the first row
    const availableColumns = Object.keys(assetData[0]);
    console.log("\nAvailable columns in Asset_anonymized.csv:");
    availableColumns.forEach((column, index) => {
        console.log(`${index + 1}. ${column}`);
    });

    return new Promise((resolve) => {
        rl.question('\nEnter column numbers to include (comma-separated, e.g., 1,3,5) or press Enter for all columns: ', (answer) => {
            rl.close();
            
            if (!answer || answer.trim().length === 0) {
                resolve([]); // Return empty array to indicate all columns
            } else {
                try {
                    const columnIndices = answer.split(',').map(num => parseInt(num.trim()) - 1);
                    const selectedColumns = columnIndices
                        .filter(index => index >= 0 && index < availableColumns.length)
                        .map(index => availableColumns[index]);
                    resolve(selectedColumns);
                } catch (error) {
                    console.error("Invalid input. Using all columns.");
                    resolve([]);
                }
            }
        });
    });
}

// console.log(assetData);

import OpenAI from "openai";

// Set up OpenAI API configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Note: Prompt will be generated dynamically based on user's column selection

// Function to call OpenAI API
async function getOpenAISummary(prompt) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: [
                { role: "system", content: "You are a data analyst. The user will provide you with actual data in JSON format. You MUST analyze this data and provide direct answers with specific numbers. NEVER ask for more data or provide SQL queries. Only give answers based on the data provided." },
                { role: "user", content: prompt }
            ]
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI API error:", error);
        return null;
    }
}

// Example usage
(async () => {
    // Get user's column selection
    const selectedColumns = await getUserColumnSelection();
    
    // Slice the data based on selected columns
    const slicedAssetData = sliceDataByColumns(assetData, selectedColumns);
    
    
    // Always include the data context, then ask for user's question
    const dataContext = `
Asset Data (${slicedAssetData.length} rows, ${Object.keys(slicedAssetData[0]).length} columns):

\`\`\`json dataset
${JSON.stringify(slicedAssetData)}
\`\`\`

Analyze this data and answer the user's question with specific numbers and findings from the dataset above. Do not ask for more data or provide SQL queries.
`;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Ask user for their question
    const userQuestion = await new Promise((resolve) => {
        rl.question('\nEnter your question about the data: ', (answer) => {
            rl.close();
            resolve(answer);
        });
    });
    
    // Combine data context with user's question
    const userPrompt = dataContext + '\n\nQuestion: ' + userQuestion;
    
    const summary = await getOpenAISummary(userPrompt);
    console.log("User Prompt:\n", userPrompt);
    console.log("OpenAI Summary:\n", summary);
})();
